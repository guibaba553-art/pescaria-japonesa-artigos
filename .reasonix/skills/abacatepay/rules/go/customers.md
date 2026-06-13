# Customer Management

Manage your customers to reuse their data in future checkouts or subscriptions.

## Operations
- **Create**: Add a new customer.
- **List**: Retrieve all customers (with pagination).
- **Get**: Retrieve a specific customer by ID.
- **Delete**: Remove a customer.

## Go Example
(Source: `examples/go/customers.go`)

// See examples/go/customers.go for implementation
func CreateCustomer(data CustomerData, metadata map[string]interface{}) (*CustomerResponse, error)
func ListCustomers() (*CustomerListResponse, error)
func GetCustomer(id string) (*CustomerResponse, error)
func DeleteCustomer(id string) error

## LGPD Compliance

When handling customer data:
- Obtain consent for data processing.
- Store only necessary data (e.g., email, name, tax ID).
- Implement data encryption and retention limits.
- Provide data portability and deletion options.