FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY pyproject.toml ./
COPY app/ ./app/

# Install Python dependencies
RUN pip install --no-cache-dir .

# Expose RADIUS ports (Auth: 1812, Acct: 1813)
EXPOSE 1812/udp
EXPOSE 1813/udp

# Health check endpoint
EXPOSE 8080

CMD ["python", "-m", "app.main"]
