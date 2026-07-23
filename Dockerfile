# Stage 1: Build the Vite frontend
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Go backend with the frontend embedded
FROM golang:1.26-alpine AS backend-builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# Drop the placeholder and put the real build where //go:embed expects it
RUN rm -rf ./internal/api/dist
COPY --from=frontend-builder /app/dist/ ./internal/api/dist/

ARG VERSION=dev
ARG BUILD_DATE=unknown
ARG GIT_SHA=unknown
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X marinetraffic/internal/api.Version=${VERSION} -X marinetraffic/internal/api.BuildDate=${BUILD_DATE} -X marinetraffic/internal/api.GitCommit=${GIT_SHA}" \
    -o marinetraffic ./cmd/marinetraffic

# Stage 3: Minimal runtime
FROM alpine:3.21
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=backend-builder /app/marinetraffic .
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["./marinetraffic"]
