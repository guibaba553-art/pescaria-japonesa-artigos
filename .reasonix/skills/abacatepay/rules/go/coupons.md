# Coupon Management

Manage discounts for your checkouts and subscriptions.

## Operations
- **Create**: Create percentage or fixed value coupons.
- **List/Get**: Retrieve coupon details.
- **Toggle**: Enable/Disable a coupon.
- **Delete**: Remove a coupon.

## Go Example
(Source: `examples/go/coupons.go`)

// See examples/go/coupons.go
func CreateCoupon(req CreateCouponRequest) (*CouponResponse, error)
func ListCoupons(page int, limit int) (*CouponListResponse, error)
func ToggleCoupon(id string) (*CouponResponse, error)
func DeleteCoupon(id string) error