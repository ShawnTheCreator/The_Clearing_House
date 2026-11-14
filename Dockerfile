# Build Stage
FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src

COPY ["backend_csharp/TheClearingHouse.Api/TheClearingHouse.Api.csproj", "backend_csharp/TheClearingHouse.Api/"]
RUN dotnet restore "backend_csharp/TheClearingHouse.Api/TheClearingHouse.Api.csproj"

COPY . .
WORKDIR "/src/backend_csharp/TheClearingHouse.Api"
RUN dotnet publish "TheClearingHouse.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime Stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY fixtures ./fixtures

ENV PORT=10000
EXPOSE 10000

ENTRYPOINT ["dotnet", "TheClearingHouse.Api.dll"]
