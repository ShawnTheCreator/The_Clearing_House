using System.Text.Json.Serialization;

namespace TheClearingHouse.Api.Models;

public class TaskListing
{
    [JsonPropertyName("job_id")]
    public string JobId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("employer")]
    public string Employer { get; set; } = string.Empty;

    [JsonPropertyName("selected_worker")]
    public string? SelectedWorker { get; set; }

    [JsonPropertyName("max_budget_yoctonear")]
    public string MaxBudgetYoctonear { get; set; } = "50000000000000000000000";

    [JsonPropertyName("awarded_price_yoctonear")]
    public string? AwardedPriceYoctonear { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "OPEN"; // OPEN, BIDDING, AWARDED, DELIVERED, CLEARED, DISPUTED

    [JsonPropertyName("deliverable_digest")]
    public string? DeliverableDigest { get; set; }

    [JsonPropertyName("timestamp_ms")]
    public long TimestampMs { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}

public class EvidenceReceipt
{
    [JsonPropertyName("receipt_id")]
    public string ReceiptId { get; set; } = string.Empty;

    [JsonPropertyName("job_id")]
    public string JobId { get; set; } = string.Empty;

    [JsonPropertyName("employer")]
    public string Employer { get; set; } = string.Empty;

    [JsonPropertyName("worker")]
    public string Worker { get; set; } = string.Empty;

    [JsonPropertyName("task_digest")]
    public string TaskDigest { get; set; } = string.Empty;

    [JsonPropertyName("result_digest")]
    public string ResultDigest { get; set; } = string.Empty;

    [JsonPropertyName("price_yoctonear")]
    public string PriceYoctonear { get; set; } = string.Empty;

    [JsonPropertyName("settlement_tx")]
    public string SettlementTx { get; set; } = string.Empty;

    [JsonPropertyName("block_height")]
    public long BlockHeight { get; set; }

    [JsonPropertyName("timestamp_ns")]
    public long TimestampNs { get; set; }

    [JsonPropertyName("outcome")]
    public string Outcome { get; set; } = "CLEARED"; // CLEARED, DISPUTED, FAILED

    [JsonPropertyName("sig")]
    public string Sig { get; set; } = string.Empty;

    [JsonPropertyName("label")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Label { get; set; }
}

public class MerkleProofStep
{
    [JsonPropertyName("position")]
    public string Position { get; set; } = "right"; // "left" or "right"

    [JsonPropertyName("hash")]
    public string Hash { get; set; } = string.Empty;
}

public class MerkleInclusionProof
{
    [JsonPropertyName("receipt_id")]
    public string ReceiptId { get; set; } = string.Empty;

    [JsonPropertyName("leaf_hash")]
    public string LeafHash { get; set; } = string.Empty;

    [JsonPropertyName("index")]
    public int Index { get; set; }

    [JsonPropertyName("total_leaves")]
    public int TotalLeaves { get; set; }

    [JsonPropertyName("root")]
    public string Root { get; set; } = string.Empty;

    [JsonPropertyName("path")]
    public List<MerkleProofStep> Path { get; set; } = new();
}

public class PublishedRootRecord
{
    [JsonPropertyName("day_utc")]
    public string DayUtc { get; set; } = DateTime.UtcNow.ToString("yyyy-MM-dd");

    [JsonPropertyName("root")]
    public string Root { get; set; } = string.Empty;

    [JsonPropertyName("leaf_count")]
    public int LeafCount { get; set; }

    [JsonPropertyName("published_at_ns")]
    public long PublishedAtNs { get; set; }

    [JsonPropertyName("published_by")]
    public string PublishedBy { get; set; } = string.Empty;

    [JsonPropertyName("block_height")]
    public long BlockHeight { get; set; }

    [JsonPropertyName("tx_hash")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TxHash { get; set; }
}

public class SubAccountRecord
{
    [JsonPropertyName("account_id")]
    public string AccountId { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty; // "employer" or "worker"

    [JsonPropertyName("public_key")]
    public string PublicKey { get; set; } = string.Empty;

    [JsonPropertyName("gas_burnt_tgas")]
    public double GasBurntTgas { get; set; }
}

public class EconomyStats
{
    [JsonPropertyName("total_cleared")]
    public int TotalCleared { get; set; }

    [JsonPropertyName("total_disputed")]
    public int TotalDisputed { get; set; }

    [JsonPropertyName("total_tasks")]
    public int TotalTasks { get; set; }

    [JsonPropertyName("total_settled_yoctonear")]
    public string TotalSettledYoctonear { get; set; } = "0";

    [JsonPropertyName("total_settled_near")]
    public double TotalSettledNear { get; set; }
}

public class DisputeRecord
{
    [JsonPropertyName("receipt_id")]
    public string ReceiptId { get; set; } = string.Empty;

    [JsonPropertyName("job_id")]
    public string JobId { get; set; } = string.Empty;

    [JsonPropertyName("employer")]
    public string Employer { get; set; } = string.Empty;

    [JsonPropertyName("worker")]
    public string Worker { get; set; } = string.Empty;

    [JsonPropertyName("price_yoctonear")]
    public string PriceYoctonear { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "DISPUTED";

    [JsonPropertyName("escrow_refunded")]
    public bool EscrowRefunded { get; set; } = true;
}

public class PostTaskRequest
{
    [JsonPropertyName("prompt")]
    public string? Prompt { get; set; }

    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("budget_near")]
    public double? BudgetNear { get; set; }

    [JsonPropertyName("employer_id")]
    public string? EmployerId { get; set; }
}

public class PostTaskResult
{
    [JsonPropertyName("task_id")]
    public string TaskId { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = "CLEARED";

    [JsonPropertyName("receipt")]
    public EvidenceReceipt? Receipt { get; set; }

    [JsonPropertyName("subtasks")]
    public object? Subtasks { get; set; }
}

public class UserProfile
{
    [JsonPropertyName("account_id")]
    public string AccountId { get; set; } = string.Empty;

    [JsonPropertyName("display_name")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = "employer"; // employer, worker, admin

    [JsonPropertyName("avatar")]
    public string Avatar { get; set; } = "U";

    [JsonPropertyName("public_key")]
    public string PublicKey { get; set; } = string.Empty;

    [JsonPropertyName("balance_near")]
    public double BalanceNear { get; set; } = 25.0;

    [JsonPropertyName("scopes")]
    public List<string> Scopes { get; set; } = new();
}

public class UserSession
{
    public string Token { get; set; } = string.Empty;
    public UserProfile User { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(7);
}

public class LoginRequest
{
    [JsonPropertyName("account_id")]
    public string AccountId { get; set; } = string.Empty;

    [JsonPropertyName("password_or_key")]
    public string? PasswordOrKey { get; set; }
}

public class LoginResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("token")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Token { get; set; }

    [JsonPropertyName("user")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public UserProfile? User { get; set; }

    [JsonPropertyName("message")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Message { get; set; }
}

public class RegisterRequest
{
    [JsonPropertyName("account_id")]
    public string AccountId { get; set; } = string.Empty;

    [JsonPropertyName("display_name")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = "employer";

    [JsonPropertyName("password_or_key")]
    public string? PasswordOrKey { get; set; }
}
