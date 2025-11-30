#!/bin/bash
# WANCOM ISP Customer Portal - Demo Quick Start Script
# ======================================================
# This script prepares the environment for a live demo

set -e

echo "🚀 WANCOM ISP Customer Portal - Demo Setup"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for required environment variables
check_env() {
    local var_name=$1
    if [ -z "${!var_name}" ]; then
        echo -e "${RED}❌ Missing required env var: $var_name${NC}"
        return 1
    fi
    echo -e "${GREEN}✅ $var_name is set${NC}"
}

echo -e "${BLUE}📋 Checking environment variables...${NC}"
echo ""

required_vars=(
    "SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
)

all_present=true
for var in "${required_vars[@]}"; do
    if ! check_env "$var"; then
        all_present=false
    fi
done

if [ "$all_present" = false ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Some environment variables are missing.${NC}"
    echo "Please set them in .env file or export them before continuing."
    echo ""
    echo "Example .env file:"
    echo "---"
    cat << 'EOF'
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key
SUPABASE_JWT_SECRET=your-jwt-secret
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_BASE=http://localhost:3001
EOF
    echo "---"
    exit 1
fi

echo ""
echo -e "${BLUE}📦 Installing dependencies...${NC}"
echo ""

# Install backend dependencies
if [ -d "backend" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install --silent && cd ..
fi

# Install frontend dependencies
if [ -d "frontend" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install --silent && cd ..
fi

echo ""
echo -e "${BLUE}🗄️  Loading demo data...${NC}"
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    # Install supabase-py if not available
    pip3 install --quiet supabase 2>/dev/null || true
    
    # Run the demo data loader
    python3 scripts/load_demo_data.py
else
    echo -e "${YELLOW}⚠️  Python3 not found. Skipping demo data load.${NC}"
    echo "You can load demo data manually by running the SQL in:"
    echo "  supabase/migrations/20241128004_demo_data.sql"
fi

echo ""
echo -e "${BLUE}🚀 Starting services...${NC}"
echo ""

# Start with docker-compose if available
if command -v docker-compose &> /dev/null || command -v docker &> /dev/null; then
    echo "Starting services with Docker Compose..."
    docker compose up -d --build
    
    echo ""
    echo -e "${GREEN}✅ Services started!${NC}"
    echo ""
    echo "Services available at:"
    echo "  Frontend:  http://localhost:3000"
    echo "  Backend:   http://localhost:3001"
    echo "  Network:   http://localhost:9100"
    echo "  RADIUS:    UDP 1812/1813"
    echo ""
else
    echo "Docker not found. Starting services in dev mode..."
    echo ""
    echo "In separate terminals, run:"
    echo "  Terminal 1: cd backend && npm run start:dev"
    echo "  Terminal 2: cd frontend && npm run dev"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}🎉 Demo environment is ready!${NC}"
echo ""
echo "Demo Credentials:"
echo "  Email: ahmed.hassan@demo.wancom.pk"
echo "  (Create via Supabase Auth or Magic Link)"
echo ""
echo "Demo Customer ID: f47ac10b-58cc-4372-a567-0e02b2c3d479"
echo ""
echo "Dashboard will show:"
echo "  • 30-day usage history with weekend peaks"
echo "  • 6 invoices (5 paid, 1 pending)"
echo "  • Network status: Online with excellent signal"
echo "=============================================="
