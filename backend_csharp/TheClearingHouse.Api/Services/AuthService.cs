using System.Collections.Concurrent;
using System.Security.Cryptography;
using TheClearingHouse.Api.Models;

namespace TheClearingHouse.Api.Services;

public class AuthService
{
    private readonly ConcurrentDictionary<string, UserProfile> _accounts = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, UserSession> _sessions = new();
    private readonly ILogger<AuthService> _logger;

    public AuthService(ILogger<AuthService> logger)
    {
        _logger = logger;
        SeedDefaultAccounts();
    }

    private void SeedDefaultAccounts()
    {
        var defaults = new[]
        {
            new UserProfile
            {
                AccountId = "employer1.clearing-house-swarm-01.testnet",
                DisplayName = "Employer Fleet Alpha",
                Role = "employer",
                Avatar = "E",
                PublicKey = "ed25519:6Q8CjP2m3vKz8yL8qEwYf1pXm8r6xNAmQHFdCNk1Ek9p",
                BalanceNear = 48.25,
                Scopes = new() { "post_task", "settle", "inspect", "dispute" }
            },
            new UserProfile
            {
                AccountId = "worker1.clearing-house-swarm-01.testnet",
                DisplayName = "Audit Worker 01",
                Role = "worker",
                Avatar = "W",
                PublicKey = "ed25519:3vKz8yL8qEwYf1pXm8r6xNAmQHFdCNk1Ek9pR5Lr5mbC",
                BalanceNear = 12.40,
                Scopes = new() { "bid", "execute", "claim" }
            },
            new UserProfile
            {
                AccountId = "worker2.clearing-house-swarm-01.testnet",
                DisplayName = "Verification Worker 02",
                Role = "worker",
                Avatar = "V",
                PublicKey = "ed25519:9pXm8r6xNAmQHFdCNk1Ek9pR5Lr5mbCs2epmKHKoqPJQ",
                BalanceNear = 9.85,
                Scopes = new() { "bid", "execute", "claim" }
            },
            new UserProfile
            {
                AccountId = "shawn.testnet",
                DisplayName = "Shawn (Admin)",
                Role = "admin",
                Avatar = "S",
                PublicKey = "ed25519:5mbCs2epmKHKoqPJQMsbYp3Zv5g1xT17hH1m5idssBMy",
                BalanceNear = 100.0,
                Scopes = new() { "admin", "post_task", "bid", "settle", "inspect", "dispute", "export" }
            }
        };

        foreach (var acc in defaults)
        {
            _accounts[acc.AccountId] = acc;
        }
    }

    public List<UserProfile> GetKnownAccounts()
    {
        return _accounts.Values.ToList();
    }

    public LoginResponse Login(LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.AccountId))
        {
            return new LoginResponse { Success = false, Message = "Account ID is required." };
        }

        string accountId = req.AccountId.Trim();

        // If not in pre-seeded accounts, auto-provision as custom NEAR account
        if (!_accounts.TryGetValue(accountId, out var profile))
        {
            profile = new UserProfile
            {
                AccountId = accountId,
                DisplayName = accountId.Split('.')[0],
                Role = accountId.Contains("worker", StringComparison.OrdinalIgnoreCase) ? "worker" : "employer",
                Avatar = char.ToUpperInvariant(accountId[0]).ToString(),
                PublicKey = "ed25519:" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16)),
                BalanceNear = 15.00,
                Scopes = new() { "post_task", "bid", "settle", "inspect" }
            };
            _accounts[accountId] = profile;
        }

        // Generate session token
        string token = "ch_sess_" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(24));
        var session = new UserSession
        {
            Token = token,
            User = profile,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(7)
        };

        _sessions[token] = session;
        _logger.LogInformation("Account '{AccountId}' logged in successfully. Token issued: {TokenPrefix}...", accountId, token[..14]);

        return new LoginResponse
        {
            Success = true,
            Token = token,
            User = profile,
            Message = "Logged in successfully."
        };
    }

    public bool Logout(string token)
    {
        return _sessions.TryRemove(token, out _);
    }

    public UserSession? GetSession(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        if (_sessions.TryGetValue(token, out var session))
        {
            if (session.ExpiresAt > DateTime.UtcNow)
            {
                return session;
            }
            _sessions.TryRemove(token, out _);
        }

        return null;
    }

    public LoginResponse Register(RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.AccountId))
        {
            return new LoginResponse { Success = false, Message = "Account ID is required." };
        }

        string accountId = req.AccountId.Trim();
        if (_accounts.ContainsKey(accountId))
        {
            // If already exists, log in directly
            return Login(new LoginRequest { AccountId = accountId, PasswordOrKey = req.PasswordOrKey });
        }

        var profile = new UserProfile
        {
            AccountId = accountId,
            DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? accountId.Split('.')[0] : req.DisplayName.Trim(),
            Role = string.IsNullOrWhiteSpace(req.Role) ? "employer" : req.Role.Trim().ToLowerInvariant(),
            Avatar = char.ToUpperInvariant(accountId[0]).ToString(),
            PublicKey = "ed25519:" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16)),
            BalanceNear = 25.00,
            Scopes = req.Role == "admin"
                ? new() { "admin", "post_task", "bid", "settle", "inspect", "dispute", "export" }
                : new() { "post_task", "bid", "settle", "inspect" }
        };

        _accounts[accountId] = profile;
        return Login(new LoginRequest { AccountId = accountId, PasswordOrKey = req.PasswordOrKey });
    }
}
