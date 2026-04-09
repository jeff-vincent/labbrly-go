module github.com/labbrly/auth

go 1.22

require (
	github.com/go-chi/chi/v5 v5.0.12
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/labbrly/shared v0.0.0
	go.mongodb.org/mongo-driver v1.15.0
)

replace github.com/labbrly/shared => ../shared
