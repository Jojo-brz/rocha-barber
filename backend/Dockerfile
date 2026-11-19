ARG GO_VERSION=1.22
FROM golang:${GO_VERSION}-bookworm as builder

WORKDIR /usr/src/app

COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .

# Compila a partir do main.go na raiz do backend
RUN CGO_ENABLED=0 GOOS=linux go build -v -o /run-app .

FROM debian:bookworm-slim

# Instala certificados SSL para conexão segura com o Neon PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata && rm -rf /var/lib/apt/lists/*

COPY --from=builder /run-app /usr/local/bin/run-app

EXPOSE 8080

CMD ["run-app"]
