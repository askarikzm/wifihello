FROM python:3.11-slim
WORKDIR /app

# Minimal static server to provide a quick deployed placeholder
COPY .static /app
EXPOSE 3000
CMD ["sh","-c","python -m http.server ${PORT:-3000}"]
