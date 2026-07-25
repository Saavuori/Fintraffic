# Stage 1: Build the Vite frontend
FROM --platform=$BUILDPLATFORM node:26-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Go backend with the frontend embedded.
# Pinned to BUILDPLATFORM and cross-compiled via GOARCH: without this the arm64
# leg of the multi-arch build runs the Go toolchain under QEMU emulation, which
# is where nearly all of the build time went. CGO_ENABLED=0 (load-bearing for
# the pure-Go SQLite driver) means cross-compiling costs nothing.
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS backend-builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# Drop the placeholder and put the real build where //go:embed expects it
RUN rm -rf ./internal/core/server/dist
COPY --from=frontend-builder /app/dist/ ./internal/core/server/dist/

# TARGETARCH is declared here rather than next to the FROM on purpose: an ARG
# joins the cache key of everything after it, so declaring it late keeps
# `go mod download` and the source/dist COPYs shared between the two arch legs.
ARG TARGETARCH
ARG VERSION=dev
ARG BUILD_DATE=unknown
ARG GIT_SHA=unknown
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} go build \
    -ldflags="-s -w -X fintraffic/internal/core/server.Version=${VERSION} -X fintraffic/internal/core/server.BuildDate=${BUILD_DATE} -X fintraffic/internal/core/server.GitCommit=${GIT_SHA}" \
    -o fintraffic ./cmd/fintraffic

# Stage 3: Minimal runtime
FROM alpine:3.24
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=backend-builder /app/fintraffic .
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["./fintraffic"]
