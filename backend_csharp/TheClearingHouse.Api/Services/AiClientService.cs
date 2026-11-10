using System.Net.Http.Json;
using System.Text.Json;

namespace TheClearingHouse.Api.Services;

public class AiClientService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<AiClientService> _logger;
    private readonly string _pythonBaseUrl;

    public AiClientService(HttpClient httpClient, IConfiguration configuration, ILogger<AiClientService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _pythonBaseUrl = configuration["AI_BACKEND_URL"] ?? "http://localhost:8000";
        _httpClient.BaseAddress = new Uri(_pythonBaseUrl);
        _httpClient.Timeout = TimeSpan.FromSeconds(15);
    }

    public async Task<JsonElement?> RunAuctionAsync(string mission, double budgetNear)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("/ai/run_auction", new
            {
                mission,
                budget_near = budgetNear
            });

            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<JsonElement>();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Call to Python AI backend failed ({Message}), using local fallback executor", ex.Message);
        }

        return null;
    }

    public async Task<JsonElement?> DecomposeMissionAsync(string mission, double budgetNear)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("/ai/decompose_mission", new
            {
                mission,
                budget_near = budgetNear
            });

            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<JsonElement>();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Call to Python AI decompose failed ({Message})", ex.Message);
        }

        return null;
    }

    public async Task<JsonElement?> BidAsync(object task)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("/ai/bid", new { task });
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<JsonElement>();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Call to Python AI bid failed ({Message})", ex.Message);
        }

        return null;
    }

    public async Task<JsonElement?> ExecuteWorkAsync(object task, string workerId, bool injectFault = false)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("/ai/execute", new
            {
                task,
                worker_id = workerId,
                inject_fault = injectFault
            });
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<JsonElement>();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Call to Python AI execute failed ({Message})", ex.Message);
        }

        return null;
    }

    public async Task<JsonElement?> InspectDeliverableAsync(string taskSpec, object deliverable)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("/ai/inspect", new
            {
                task_spec = taskSpec,
                deliverable
            });
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<JsonElement>();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Call to Python AI inspect failed ({Message})", ex.Message);
        }

        return null;
    }
}
