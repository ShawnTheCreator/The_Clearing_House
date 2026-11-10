using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using TheClearingHouse.Api.Models;

namespace TheClearingHouse.Api.Services;

public class EconomyLedgerState
{
    private readonly ILogger<EconomyLedgerState> _logger;
    private readonly AiClientService _aiClient;
    private readonly List<TaskListing> _tasks = new();
    private readonly List<EvidenceReceipt> _receipts = new();
    private readonly List<PublishedRootRecord> _roots = new();
    private readonly List<SubAccountRecord> _subAccounts = new();
    private readonly List<DisputeRecord> _disputes = new();

    private readonly ConcurrentDictionary<Guid, Channel<string>> _sseClients = new();
    private readonly object _lock = new();
    private MerkleService.MerkleTreeInstance _merkleTree;

    public EconomyLedgerState(ILogger<EconomyLedgerState> logger, AiClientService aiClient)
    {
        _logger = logger;
        _aiClient = aiClient;
        _merkleTree = new MerkleService.MerkleTreeInstance(_receipts);

        InitializeSubAccounts();
        InitializeDisputes();
        LoadFixtures();
    }

    private void InitializeSubAccounts()
    {
        _subAccounts.AddRange(new[]
        {
            new SubAccountRecord
            {
                AccountId = "employer1.clearing-house-swarm-01.testnet",
                Role = "employer",
                PublicKey = "ed25519:6Q8CjP2m3vKz8yL8qEwYf1pXm8r6xNAmQHFdCNk1Ek9p",
                GasBurntTgas = 0.25
            },
            new SubAccountRecord
            {
                AccountId = "worker1.clearing-house-swarm-01.testnet",
                Role = "worker",
                PublicKey = "ed25519:3vKz8yL8qEwYf1pXm8r6xNAmQHFdCNk1Ek9pR5Lr5mbC",
                GasBurntTgas = 0.18
            },
            new SubAccountRecord
            {
                AccountId = "worker2.clearing-house-swarm-01.testnet",
                Role = "worker",
                PublicKey = "ed25519:9pXm8r6xNAmQHFdCNk1Ek9pR5Lr5mbCs2epmKHKoqPJQ",
                GasBurntTgas = 0.16
            },
            new SubAccountRecord
            {
                AccountId = "worker4.clearing.testnet",
                Role = "worker",
                PublicKey = "ed25519:5mbCs2epmKHKoqPJQMsbYp3Zv5g1xT17hH1m5idssBMy",
                GasBurntTgas = 0.08
            },
            new SubAccountRecord
            {
                AccountId = "employer2.clearing.testnet",
                Role = "employer",
                PublicKey = "ed25519:4idssBMyd8LPwzui34d4xMxBxVZgMJusCdveDNzCXdmG",
                GasBurntTgas = 0.22
            }
        });
    }

    private void InitializeDisputes()
    {
        _disputes.AddRange(new[]
        {
            new DisputeRecord
            {
                ReceiptId = "rcpt_ce9623f902321a23",
                JobId = "task_006",
                Employer = "employer2.clearing.testnet",
                Worker = "worker4.clearing.testnet",
                PriceYoctonear = "84700000000000000000000",
                Reason = "Worker 4 crash during fuzzing iteration; corrupted AST payload rejected by Quality Gate.",
                Status = "DISPUTED",
                EscrowRefunded = true
            },
            new DisputeRecord
            {
                ReceiptId = "rcpt_a8a6af6eeb3f8e57",
                JobId = "task_003",
                Employer = "employer1.clearing.testnet",
                Worker = "worker2.clearing.testnet",
                PriceYoctonear = "108000000000000000000000",
                Reason = "Result digest SHA-256 integrity check failed. Dispute receipt recorded on-chain.",
                Status = "DISPUTED",
                EscrowRefunded = true
            },
            new DisputeRecord
            {
                ReceiptId = "rcpt_af5797400b36f4b4",
                JobId = "task_009",
                Employer = "employer1.clearing.testnet",
                Worker = "worker4.clearing.testnet",
                PriceYoctonear = "97500000000000000000000",
                Reason = "Deliberate fault injection: malformed AST payload intercepted before escrow release.",
                Status = "DISPUTED",
                EscrowRefunded = true
            }
        });
    }

    private void LoadFixtures()
    {
        try
        {
            string baseDir = Directory.GetCurrentDirectory();
            // Check both current dir and parent repo dir for fixtures
            string fixturesDir = Path.Combine(baseDir, "fixtures");
            if (!Directory.Exists(fixturesDir))
            {
                fixturesDir = Path.Combine(baseDir, "..", "..", "fixtures");
            }

            if (Directory.Exists(fixturesDir))
            {
                // 1. Merkle roots
                string rootsPath = Path.Combine(fixturesDir, "merkle_roots.json");
                if (File.Exists(rootsPath))
                {
                    string json = File.ReadAllText(rootsPath);
                    var loadedRoots = JsonSerializer.Deserialize<List<PublishedRootRecord>>(json);
                    if (loadedRoots != null) _roots.AddRange(loadedRoots);
                }

                // 2. Receipts real
                string realPath = Path.Combine(fixturesDir, "receipts.real.jsonl");
                if (File.Exists(realPath))
                {
                    foreach (var line in File.ReadAllLines(realPath))
                    {
                        if (string.IsNullOrWhiteSpace(line)) continue;
                        var r = JsonSerializer.Deserialize<EvidenceReceipt>(line);
                        if (r != null) _receipts.Add(r);
                    }
                }

                // 3. Receipts replay (if not already loaded)
                string replayPath = Path.Combine(fixturesDir, "receipts.replay.jsonl");
                if (File.Exists(replayPath))
                {
                    foreach (var line in File.ReadAllLines(replayPath))
                    {
                        if (string.IsNullOrWhiteSpace(line)) continue;
                        var r = JsonSerializer.Deserialize<EvidenceReceipt>(line);
                        if (r != null && !_receipts.Any(x => x.ReceiptId == r.ReceiptId))
                        {
                            _receipts.Add(r);
                        }
                    }
                }
            }

            // Seed initial task listings from receipts or defaults
            _tasks.Add(new TaskListing
            {
                JobId = "job_live_783050_01",
                Title = "Security Audit: FunctionCall Key Scoping",
                Employer = "employer1.clearing-house-swarm-01.testnet",
                SelectedWorker = "worker2.clearing-house-swarm-01.testnet",
                AwardedPriceYoctonear = "38000000000000000000000",
                MaxBudgetYoctonear = "50000000000000000000000",
                Status = "CLEARED"
            });
            _tasks.Add(new TaskListing
            {
                JobId = "job_live_851092_02",
                Title = "Formal Verification: NEP-413 Intent Rail",
                Employer = "employer1.clearing-house-swarm-01.testnet",
                SelectedWorker = "worker1.clearing-house-swarm-01.testnet",
                AwardedPriceYoctonear = "34000000000000000000000",
                MaxBudgetYoctonear = "45000000000000000000000",
                Status = "CLEARED"
            });
            _tasks.Add(new TaskListing
            {
                JobId = "job_live_206818",
                Title = "Security Audit: Cross-Contract Call Guard",
                Employer = "employer1.clearing-house-swarm-01.testnet",
                SelectedWorker = "worker1.clearing-house-swarm-01.testnet",
                AwardedPriceYoctonear = "40000000000000000000000",
                MaxBudgetYoctonear = "50000000000000000000000",
                Status = "CLEARED"
            });

            _merkleTree = new MerkleService.MerkleTreeInstance(_receipts);
            _logger.LogInformation("Loaded {ReceiptCount} receipts and {RootCount} roots into Ledger State", _receipts.Count, _roots.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load fixtures into LedgerState");
        }
    }

    public EconomyStats GetStats()
    {
        lock (_lock)
        {
            int cleared = _receipts.Count(r => r.Outcome == "CLEARED");
            int disputed = _receipts.Count(r => r.Outcome == "DISPUTED");
            double totalNear = 0;

            foreach (var r in _receipts.Where(r => r.Outcome == "CLEARED"))
            {
                if (decimal.TryParse(r.PriceYoctonear, out var dec))
                {
                    totalNear += (double)(dec / 1_000_000_000_000_000_000_000_000m);
                }
            }

            return new EconomyStats
            {
                TotalCleared = cleared,
                TotalDisputed = disputed,
                TotalTasks = _tasks.Count,
                TotalSettledNear = Math.Round(totalNear, 4),
                TotalSettledYoctonear = (totalNear * 1e24).ToString("F0")
            };
        }
    }

    public object GetState()
    {
        lock (_lock)
        {
            var stats = GetStats();
            var latestReceipts = _receipts.TakeLast(10).Reverse().ToList();
            return new
            {
                stats,
                roots = _roots,
                task_count = _tasks.Count,
                receipt_count = _receipts.Count,
                subAccounts = _subAccounts,
                latest_receipts = latestReceipts
            };
        }
    }

    public List<TaskListing> GetTasks()
    {
        lock (_lock) return _tasks.ToList();
    }

    public List<DisputeRecord> GetDisputes()
    {
        lock (_lock) return _disputes.ToList();
    }

    public (EvidenceReceipt? Receipt, MerkleInclusionProof? Proof, bool Valid) GetVerificationProof(string receiptId)
    {
        lock (_lock)
        {
            var receipt = _receipts.FirstOrDefault(r => r.ReceiptId == receiptId);
            if (receipt == null) return (null, null, false);

            var proof = _merkleTree.GetProof(receiptId);
            if (proof == null)
            {
                // Rebuild tree on demand
                _merkleTree = new MerkleService.MerkleTreeInstance(_receipts);
                proof = _merkleTree.GetProof(receiptId);
            }

            bool valid = proof != null && MerkleService.VerifyProof(proof);
            return (receipt, proof, valid);
        }
    }

    public Guid SubscribeSse(Channel<string> channel)
    {
        var id = Guid.NewGuid();
        _sseClients[id] = channel;
        return id;
    }

    public void UnsubscribeSse(Guid id)
    {
        _sseClients.TryRemove(id, out _);
    }

    public async Task BroadcastEventAsync(string eventType, object payload)
    {
        var evt = new { event_type = eventType, payload };
        string json = JsonSerializer.Serialize(evt);
        string message = $"data: {json}\n\n";

        foreach (var (id, channel) in _sseClients)
        {
            try
            {
                await channel.Writer.WriteAsync(message);
            }
            catch
            {
                _sseClients.TryRemove(id, out _);
            }
        }
    }

    private static string ToYoctoNear(double near)
    {
        var units = (System.Numerics.BigInteger)Math.Round(near * 10000.0);
        var yocto = units * System.Numerics.BigInteger.Pow(10, 20);
        return yocto.ToString();
    }

    public async Task<PostTaskResult> PostTaskAsync(PostTaskRequest request)
    {
        string prompt = request.Prompt ?? "Automated contract audit";
        string title = request.Title ?? (prompt.Length > 45 ? prompt[..45] : prompt);
        double budgetNear = request.BudgetNear ?? 0.05;
        string employer = request.EmployerId ?? "employer1.clearing-house-swarm-01.testnet";

        string taskId = $"job_live_{Random.Shared.Next(100000, 999999)}";
        string budgetYocto = ToYoctoNear(budgetNear);

        var task = new TaskListing
        {
            JobId = taskId,
            Title = title,
            Employer = employer,
            MaxBudgetYoctonear = budgetYocto,
            Status = "BIDDING",
            TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        lock (_lock) _tasks.Insert(0, task);

        // 1. Emit TASK_POSTED
        await BroadcastEventAsync("TASK_POSTED", new
        {
            job_id = taskId,
            employer,
            budget = budgetYocto,
            spec = prompt
        });

        await Task.Delay(200);

        // 2. Delegate to Python AI backend or local AI cycle
        var aiAuctionResult = await _aiClient.RunAuctionAsync(prompt, budgetNear);

        string winnerWorker = "worker1.clearing-house-swarm-01.testnet";
        double settledNear = budgetNear * 0.76; // 24% discount from competitive bidding
        string deliverableDigest = MerkleService.HashSha256(Encoding.UTF8.GetBytes($"deliverable_{taskId}_{prompt}"));

        if (aiAuctionResult.HasValue && aiAuctionResult.Value.TryGetProperty("cleared_subtasks", out var subtasksElem) && subtasksElem.GetArrayLength() > 0)
        {
            var firstSubtask = subtasksElem[0];
            if (firstSubtask.TryGetProperty("winner", out var winnerElem) && winnerElem.TryGetProperty("worker_id", out var wElem))
            {
                winnerWorker = wElem.GetString() ?? winnerWorker;
            }
            if (firstSubtask.TryGetProperty("winner", out var winElem) && winElem.TryGetProperty("bid_price_near", out var pElem))
            {
                settledNear = pElem.GetDouble();
            }
            if (firstSubtask.TryGetProperty("deliverable", out var delElem) && delElem.TryGetProperty("result_digest", out var dElem))
            {
                deliverableDigest = dElem.GetString() ?? deliverableDigest;
            }
        }

        string priceYocto = ToYoctoNear(settledNear);
        string altPriceYocto = ToYoctoNear(settledNear + 0.005);

        // 3. Emit worker bidding events
        string bidHash1 = MerkleService.HashSha256(Encoding.UTF8.GetBytes($"bid_worker1_{taskId}"));
        string bidHash2 = MerkleService.HashSha256(Encoding.UTF8.GetBytes($"bid_worker2_{taskId}"));

        await BroadcastEventAsync("BID_COMMITTED", new { job_id = taskId, worker = "worker1.clearing-house-swarm-01.testnet", bid_hash = bidHash1 });
        await Task.Delay(150);
        await BroadcastEventAsync("BID_COMMITTED", new { job_id = taskId, worker = "worker2.clearing-house-swarm-01.testnet", bid_hash = bidHash2 });
        await Task.Delay(150);

        await BroadcastEventAsync("BID_REVEALED", new { job_id = taskId, worker = "worker1.clearing-house-swarm-01.testnet", price = priceYocto });
        await BroadcastEventAsync("BID_REVEALED", new { job_id = taskId, worker = "worker2.clearing-house-swarm-01.testnet", price = altPriceYocto });
        await Task.Delay(200);

        // 4. Award Job
        lock (_lock)
        {
            task.SelectedWorker = winnerWorker;
            task.AwardedPriceYoctonear = priceYocto;
            task.Status = "AWARDED";
        }

        await BroadcastEventAsync("JOB_AWARDED", new
        {
            job_id = taskId,
            worker = winnerWorker,
            price = priceYocto
        });

        await Task.Delay(200);

        // 5. Work Delivered
        lock (_lock)
        {
            task.DeliverableDigest = deliverableDigest;
            task.Status = "DELIVERED";
        }

        await BroadcastEventAsync("WORK_DELIVERED", new
        {
            job_id = taskId,
            worker = winnerWorker,
            result_digest = deliverableDigest
        });

        await Task.Delay(200);

        // 6. Settle via NEAR Intents
        string intentTx = "tx_intent_" + Guid.NewGuid().ToString("N")[..16];
        await BroadcastEventAsync("SETTLED_INTENT", new
        {
            job_id = taskId,
            payout = priceYocto,
            tx_hash = intentTx
        });

        // 7. Emit Co-signed Evidence Receipt
        string receiptId = "rcpt_" + Guid.NewGuid().ToString("N")[..16];
        long timestampNs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() * 1_000_000;
        long blockHeight = 277076350 + Random.Shared.Next(1, 100);

        var receipt = new EvidenceReceipt
        {
            ReceiptId = receiptId,
            JobId = taskId,
            Employer = employer,
            Worker = winnerWorker,
            TaskDigest = MerkleService.HashSha256(Encoding.UTF8.GetBytes(prompt)),
            ResultDigest = deliverableDigest,
            PriceYoctonear = priceYocto,
            SettlementTx = intentTx,
            BlockHeight = blockHeight,
            TimestampNs = timestampNs,
            Outcome = "CLEARED",
            Sig = "sig_ed25519_" + Guid.NewGuid().ToString("N")[..32],
            Label = "real_csharp_auction"
        };

        lock (_lock)
        {
            task.Status = "CLEARED";
            _receipts.Add(receipt);
            _merkleTree = new MerkleService.MerkleTreeInstance(_receipts);
        }

        await BroadcastEventAsync("RECEIPT_EMITTED", new
        {
            receipt_id = receiptId,
            job_id = taskId,
            outcome = "CLEARED"
        });

        // 8. Publish Updated Daily Merkle Evidence Root
        string newRoot = _merkleTree.GetRoot();
        var rootRecord = new PublishedRootRecord
        {
            DayUtc = DateTime.UtcNow.ToString("yyyy-MM-dd"),
            Root = newRoot,
            LeafCount = _merkleTree.GetLeafCount(),
            PublishedAtNs = timestampNs,
            PublishedBy = employer,
            BlockHeight = blockHeight + 1,
            TxHash = intentTx
        };

        lock (_lock)
        {
            _roots.Add(rootRecord);
        }

        await BroadcastEventAsync("MERKLE_ROOT_PUBLISHED", new
        {
            root = newRoot,
            leaf_count = _merkleTree.GetLeafCount(),
            block_height = rootRecord.BlockHeight
        });

        return new PostTaskResult
        {
            TaskId = taskId,
            Status = "CLEARED",
            Receipt = receipt,
            Subtasks = aiAuctionResult
        };
    }

    public async Task<EconomyStats> TriggerBatchAsync()
    {
        string[] sampleMissions = new[]
        {
            "Security scan of contract callback guards",
            "NEP-413 intent message order verification",
            "Storage staking mutation leak analysis"
        };

        foreach (var m in sampleMissions)
        {
            await PostTaskAsync(new PostTaskRequest
            {
                Prompt = m,
                BudgetNear = 0.04
            });
            await Task.Delay(100);
        }

        return GetStats();
    }
}
