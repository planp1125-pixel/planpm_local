#!/bin/bash
# Database initialization script for Plan-PM Docker deployment
# This script runs ALL SQL migrations in order

set -e

echo "🚀 Initializing Plan-PM Database..."

# Run migrations in order
for file in /docker-entrypoint-initdb.d/migrations/*.sql; do
    if [ -f "$file" ]; then
        echo "📄 Running migration: $(basename $file)"
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
    fi
done

echo "✅ Database initialization complete!"
