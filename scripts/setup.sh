#!/usr/bin/env bash
set -euo pipefail

echo "=== Device Pool Setup ==="

echo "1. Installing dependencies..."
npm install --legacy-peer-deps

echo "2. Generating Prisma client..."
npx prisma generate

echo "3. Starting PostgreSQL (via Docker Compose)..."
docker compose up -d postgres
echo "   Waiting for PostgreSQL to be ready..."
sleep 3

echo "4. Running database migrations..."
npx prisma migrate deploy 2>/dev/null || npx prisma db push --force-reset

echo "5. Seeding database..."
npx tsx prisma/seed.ts

echo ""
echo "=== Setup complete! ==="
echo "Run 'npm run dev' to start the development server."
echo ""
echo "Sample accounts:"
echo "  admin@example.com / admin123 (admin)"
echo "  alice@example.com / alice123 (user)"
echo "  bob@example.com   / bob123   (user)"
echo "  auditor@example.com / auditor123 (auditor)"
