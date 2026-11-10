using System.Text.Json;
using System.Threading.Channels;
using TheClearingHouse.Api.Models;
using TheClearingHouse.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Configure Port 5000
builder.WebHost.UseUrls("http://0.0.0.0:5000");

// Add Services
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddHttpClient<AiClientService>();
builder.Services.AddSingleton<EconomyLedgerState>();

var app = builder.Build();

app.UseCors();

// 1. Health check
app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "The Clearing House · C# General Backend",
    version = "0.1.0",
    network = "NEAR Testnet",
    contracts = new
    {
        job_board = "job-board.clearing-house-swarm-01.testnet",
        evidence_ledger = "job-board.clearing-house-swarm-01.testnet"
    },
    ai_backend = "http://localhost:8000"
}));

app.MapGet("/", () => Results.Redirect("/health"));

// 2. Economy State
app.MapGet("/api/state", (EconomyLedgerState ledger) =>
{
    return Results.Ok(ledger.GetState());
});

// 3. Tasks list
app.MapGet("/api/tasks", (EconomyLedgerState ledger) =>
{
    return Results.Ok(new { tasks = ledger.GetTasks() });
});

// 4. Disputes
app.MapGet("/api/disputes", (EconomyLedgerState ledger) =>
{
    return Results.Ok(new { disputes = ledger.GetDisputes() });
});

// 5. Verification Endpoint
app.MapGet("/api/verify/{receiptId}", (string receiptId, EconomyLedgerState ledger) =>
{
    var (receipt, proof, valid) = ledger.GetVerificationProof(receiptId);
    if (receipt == null || proof == null)
    {
        return Results.NotFound(new { error = "Receipt not found in evidence ledger" });
    }

    return Results.Ok(new { receipt, proof, valid });
});

// 6. Post Task / Dispatch Mission
app.MapPost("/api/post_task", async (PostTaskRequest req, EconomyLedgerState ledger) =>
{
    try
    {
        var result = await ledger.PostTaskAsync(req);
        return Results.Ok(new { success = true, result });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

// 7. Trigger Batch
app.MapPost("/api/trigger_batch", async (EconomyLedgerState ledger) =>
{
    var stats = await ledger.TriggerBatchAsync();
    return Results.Ok(new { success = true, stats });
});

// 8. Export state
app.MapGet("/api/export", (EconomyLedgerState ledger) =>
{
    var state = ledger.GetState();
    return Results.File(
        JsonSerializer.SerializeToUtf8Bytes(state, new JsonSerializerOptions { WriteIndented = true }),
        "application/json",
        "clearing-house-export.json"
    );
});

// 9. SSE Live Event Stream
app.MapGet("/api/stream", async (HttpContext ctx, EconomyLedgerState ledger) =>
{
    ctx.Response.Headers.Append("Content-Type", "text/event-stream");
    ctx.Response.Headers.Append("Cache-Control", "no-cache");
    ctx.Response.Headers.Append("Connection", "keep-alive");

    var channel = Channel.CreateUnbounded<string>();
    var clientId = ledger.SubscribeSse(channel);

    try
    {
        await ctx.Response.WriteAsync(": connected\n\n");
        await ctx.Response.Body.FlushAsync();

        while (!ctx.RequestAborted.IsCancellationRequested)
        {
            var msg = await channel.Reader.ReadAsync(ctx.RequestAborted);
            await ctx.Response.WriteAsync(msg);
            await ctx.Response.Body.FlushAsync();
        }
    }
    catch (OperationCanceledException)
    {
        // Client disconnected normally
    }
    finally
    {
        ledger.UnsubscribeSse(clientId);
    }
});

Console.WriteLine("★ C# General Backend running on http://localhost:5000");
app.Run();
