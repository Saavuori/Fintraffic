package cache

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisCache struct {
	client *redis.Client
	key    string
}

// NewRedisCache connects to Redis and stores all positions in one hash under
// hashKey, giving each mode its own namespace (e.g. "fintraffic:meri:positions").
func NewRedisCache(redisURL, hashKey string) (*RedisCache, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis URL: %w", err)
	}

	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping redis: %w", err)
	}

	return &RedisCache{client: client, key: hashKey}, nil
}

func (r *RedisCache) SetPosition(ctx context.Context, mmsi string, payload []byte) error {
	return r.client.HSet(ctx, r.key, mmsi, payload).Err()
}

func (r *RedisCache) GetAllPositions(ctx context.Context) (map[string][]byte, error) {
	results, err := r.client.HGetAll(ctx, r.key).Result()
	if err != nil {
		return nil, err
	}

	positions := make(map[string][]byte, len(results))
	for k, v := range results {
		positions[k] = []byte(v)
	}
	return positions, nil
}

func (r *RedisCache) DeletePosition(ctx context.Context, mmsi string) error {
	return r.client.HDel(ctx, r.key, mmsi).Err()
}

func (r *RedisCache) SetValue(ctx context.Context, key string, payload []byte, ttl time.Duration) error {
	return r.client.Set(ctx, key, payload, ttl).Err()
}

func (r *RedisCache) GetValue(ctx context.Context, key string) ([]byte, error) {
	payload, err := r.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return payload, nil
}

func (r *RedisCache) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

func (r *RedisCache) Close() error {
	return r.client.Close()
}
