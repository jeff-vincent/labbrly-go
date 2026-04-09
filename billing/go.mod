module github.com/labbrly/billing

go 1.22

require (
	github.com/labbrly/shared v0.0.0
	github.com/redis/go-redis/v9 v9.5.1
	github.com/stripe/stripe-go/v82 v82.0.0
	go.mongodb.org/mongo-driver v1.15.0
)

replace github.com/labbrly/shared => ../shared

require (
	github.com/cespare/xxhash/v2 v2.2.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/golang/snappy v0.0.4 // indirect
	github.com/klauspost/compress v1.17.2 // indirect
	github.com/montanaflynn/stats v0.7.1 // indirect
	github.com/xdg-go/pbkdf2 v1.0.0 // indirect
	github.com/xdg-go/scram v1.1.2 // indirect
	github.com/xdg-go/stringprep v1.0.4 // indirect
	github.com/youmark/pkcs8 v0.0.0-20201027041543-1326539a0a0a // indirect
	golang.org/x/crypto v0.22.0 // indirect
	golang.org/x/sync v0.7.0 // indirect
	golang.org/x/text v0.14.0 // indirect
)
