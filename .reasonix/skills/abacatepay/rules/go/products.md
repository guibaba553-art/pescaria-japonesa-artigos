# Product Management

Products represent items in your catalog that can be used in checkouts or subscriptions. Use the AbacatePay API to manage them via CRUD operations.

## Key Concepts

- **External ID**: A unique identifier from your system (e.g., SKU) to track products.
- **Caching**: Implement caching for list operations to reduce API calls and improve performance.
- **Integration**: Products are referenced in checkouts and subscriptions by their ID.

## Operations

### Create a Product

Send a POST request to `/products/create` with required fields.

```go
type CreateProductRequest struct {
    ExternalID string `json:"externalId"`
    Name       string `json:"name"`
    Price      int    `json:"price"`
    Currency   string `json:"currency"`
}

func CreateProduct(req CreateProductRequest) (*ProductResponse, error) {
    apiKey := os.Getenv("ABACATEPAY_API_KEY")
    jsonBody, _ := json.Marshal(req)

    reqAPI, _ := http.NewRequest("POST", BaseURL+"/products/create", bytes.NewBuffer(jsonBody))
    reqAPI.Header.Set("Authorization", "Bearer "+apiKey)
    reqAPI.Header.Set("Content-Type", "application/json")

    client := &http.Client{Timeout: 10 * time.Second}
    resp, _ := client.Do(reqAPI)
    defer resp.Body.Close()

    if resp.StatusCode >= 400 {
        body, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("api error: %s", string(body))
    }

    var result ProductResponse
    json.NewDecoder(resp.Body).Decode(&result)
    return &result, nil
}
```

### List Products

Fetch paginated lists with caching.

```go
var cache = make(map[string]cacheEntry)
var cacheMutex sync.RWMutex
const cacheTTL = 5 * time.Minute

type cacheEntry struct {
    data      interface{}
    timestamp time.Time
}

func ListProducts(page, limit int) (*ProductListResponse, error) {
    cacheKey := fmt.Sprintf("products_list_%d_%d", page, limit)
    cacheMutex.RLock()
    entry, found := cache[cacheKey]
    cacheMutex.RUnlock()

    if found && time.Since(entry.timestamp) < cacheTTL {
        fmt.Println("Returning cached products")
        return entry.data.(*ProductListResponse), nil
    }

    apiKey := os.Getenv("ABACATEPAY_API_KEY")
    url := fmt.Sprintf("%s/products/list?page=%d&limit=%d", BaseURL, page, limit)
    reqAPI, _ := http.NewRequest("GET", url, nil)
    reqAPI.Header.Set("Authorization", "Bearer "+apiKey)

    client := &http.Client{Timeout: 10 * time.Second}
    resp, _ := client.Do(reqAPI)
    defer resp.Body.Close()

    if resp.StatusCode >= 400 {
        body, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("api error: %s", string(body))
    }

    var result ProductListResponse
    json.NewDecoder(resp.Body).Decode(&result)

    cacheMutex.Lock()
    cache[cacheKey] = cacheEntry{data: &result, timestamp: time.Now()}
    cacheMutex.Unlock()

    return &result, nil
}
```

### Get and Delete Products

Similar patterns: GET for `/products/get?id=...`, DELETE for `/products/delete`.

## Best Practices

- **Validation**: Check API responses and handle errors.
- **Caching**: Use mutex for thread safety in concurrent apps.
- **Security**: Secure API keys; validate inputs.
- **Integration**: Use externalId for linking to your system.

See full examples in `examples/go/products.go`.</content>
<parameter name="filePath">/home/albqvxc/www/abacatepay/skills/rules/go/products.md