FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget tar && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ARG STOCKFISH_VERSION=sf_18
RUN wget -q -O /tmp/stockfish.tar "https://github.com/official-stockfish/Stockfish/releases/download/${STOCKFISH_VERSION}/stockfish-ubuntu-x86-64-avx2.tar" \
    && tar -xf /tmp/stockfish.tar -C /usr/local/bin --strip-components=1 \
    && mv /usr/local/bin/stockfish-ubuntu-x86-64-avx2 /usr/local/bin/stockfish \
    && chmod +x /usr/local/bin/stockfish \
    && rm /tmp/stockfish.tar \
    && stockfish --help | head -2

WORKDIR /app
COPY app/ ./app/

EXPOSE 8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
