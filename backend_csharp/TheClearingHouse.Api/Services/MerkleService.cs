using System.Security.Cryptography;
using System.Text;
using TheClearingHouse.Api.Models;

namespace TheClearingHouse.Api.Services;

public class MerkleService
{
    public static byte[] HexToBytes(string hex)
    {
        if (hex.Length % 2 != 0)
            throw new ArgumentException("Hex string must have an even length", nameof(hex));

        byte[] bytes = new byte[hex.Length / 2];
        for (int i = 0; i < bytes.Length; i++)
        {
            bytes[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
        }
        return bytes;
    }

    public static string BytesToHex(byte[] bytes)
    {
        return Convert.ToHexStringLower(bytes);
    }

    public static string HashSha256(byte[] data)
    {
        byte[] hash = SHA256.HashData(data);
        return BytesToHex(hash);
    }

    public static string HashLeaf(string leafHex)
    {
        byte[] leafBytes = HexToBytes(leafHex);
        byte[] buffer = new byte[1 + leafBytes.Length];
        buffer[0] = 0x00; // RFC 6962 leaf domain separation
        Buffer.BlockCopy(leafBytes, 0, buffer, 1, leafBytes.Length);
        return HashSha256(buffer);
    }

    public static string HashNode(string leftHex, string rightHex)
    {
        byte[] leftBytes = HexToBytes(leftHex);
        byte[] rightBytes = HexToBytes(rightHex);
        byte[] buffer = new byte[1 + leftBytes.Length + rightBytes.Length];
        buffer[0] = 0x01; // RFC 6962 internal node domain separation
        Buffer.BlockCopy(leftBytes, 0, buffer, 1, leftBytes.Length);
        Buffer.BlockCopy(rightBytes, 0, buffer, 1 + leftBytes.Length, rightBytes.Length);
        return HashSha256(buffer);
    }

    public static string CanonicalJson(EvidenceReceipt r)
    {
        // Deterministic JSON with alphabetically sorted keys, no whitespace:
        // block_height, employer, job_id, outcome, price_yoctonear, receipt_id, result_digest, settlement_tx, task_digest, timestamp_ns, worker
        var sb = new StringBuilder();
        sb.Append('{');
        sb.Append($"\"block_height\":{r.BlockHeight},");
        sb.Append($"\"employer\":\"{EscapeJson(r.Employer)}\",");
        sb.Append($"\"job_id\":\"{EscapeJson(r.JobId)}\",");
        sb.Append($"\"outcome\":\"{EscapeJson(r.Outcome)}\",");
        sb.Append($"\"price_yoctonear\":\"{EscapeJson(r.PriceYoctonear)}\",");
        sb.Append($"\"receipt_id\":\"{EscapeJson(r.ReceiptId)}\",");
        sb.Append($"\"result_digest\":\"{EscapeJson(r.ResultDigest)}\",");
        sb.Append($"\"settlement_tx\":\"{EscapeJson(r.SettlementTx)}\",");
        sb.Append($"\"task_digest\":\"{EscapeJson(r.TaskDigest)}\",");
        sb.Append($"\"timestamp_ns\":{r.TimestampNs},");
        sb.Append($"\"worker\":\"{EscapeJson(r.Worker)}\"");
        sb.Append('}');
        return sb.ToString();
    }

    private static string EscapeJson(string s)
    {
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    public static string HashReceipt(EvidenceReceipt receipt)
    {
        string canonical = CanonicalJson(receipt);
        return HashSha256(Encoding.UTF8.GetBytes(canonical));
    }

    public class MerkleTreeInstance
    {
        private readonly List<string> _leaves = new();
        private readonly Dictionary<string, (int Index, EvidenceReceipt Receipt)> _receiptMap = new();
        private readonly List<List<string>> _layers = new();

        public MerkleTreeInstance(IEnumerable<EvidenceReceipt> receipts)
        {
            var sorted = receipts.OrderBy(r => r.ReceiptId, StringComparer.Ordinal).ToList();
            for (int i = 0; i < sorted.Count; i++)
            {
                var r = sorted[i];
                _receiptMap[r.ReceiptId] = (i, r);
                string rawHash = HashReceipt(r);
                _leaves.Add(HashLeaf(rawHash));
            }
            ComputeLayers();
        }

        private void ComputeLayers()
        {
            _layers.Clear();
            if (_leaves.Count == 0)
            {
                _layers.Add(new List<string> { HashSha256(Array.Empty<byte>()) });
                return;
            }

            var currentLayer = new List<string>(_leaves);
            _layers.Add(currentLayer);

            while (currentLayer.Count > 1)
            {
                var nextLayer = new List<string>();
                for (int i = 0; i < currentLayer.Count; i += 2)
                {
                    if (i + 1 < currentLayer.Count)
                    {
                        nextLayer.Add(HashNode(currentLayer[i], currentLayer[i + 1]));
                    }
                    else
                    {
                        // Paired with self
                        nextLayer.Add(HashNode(currentLayer[i], currentLayer[i]));
                    }
                }
                _layers.Add(nextLayer);
                currentLayer = nextLayer;
            }
        }

        public string GetRoot()
        {
            if (_layers.Count == 0) return HashSha256(Array.Empty<byte>());
            return _layers[^1][0];
        }

        public int GetLeafCount() => _leaves.Count;

        public MerkleInclusionProof? GetProof(string receiptId)
        {
            if (!_receiptMap.TryGetValue(receiptId, out var entry))
                return null;

            int index = entry.Index;
            string leafHash = _leaves[index];
            var path = new List<MerkleProofStep>();

            for (int layerIdx = 0; layerIdx < _layers.Count - 1; layerIdx++)
            {
                var layer = _layers[layerIdx];
                bool isRight = (index % 2 == 1);
                int siblingIndex = isRight ? index - 1 : index + 1;

                if (siblingIndex < layer.Count)
                {
                    path.Add(new MerkleProofStep
                    {
                        Position = isRight ? "left" : "right",
                        Hash = layer[siblingIndex]
                    });
                }
                else
                {
                    // Paired with self
                    path.Add(new MerkleProofStep
                    {
                        Position = "right",
                        Hash = layer[index]
                    });
                }

                index /= 2;
            }

            return new MerkleInclusionProof
            {
                ReceiptId = receiptId,
                LeafHash = leafHash,
                Index = entry.Index,
                TotalLeaves = _leaves.Count,
                Root = GetRoot(),
                Path = path
            };
        }
    }

    public static bool VerifyProof(MerkleInclusionProof proof)
    {
        string currentHash = proof.LeafHash;

        foreach (var step in proof.Path)
        {
            if (step.Position == "left")
            {
                currentHash = HashNode(step.Hash, currentHash);
            }
            else
            {
                currentHash = HashNode(currentHash, step.Hash);
            }
        }

        return currentHash.Equals(proof.Root, StringComparison.OrdinalIgnoreCase);
    }
}
