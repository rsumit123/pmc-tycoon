FROM python:3.13-slim

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn sqlalchemy pydantic

COPY . .

RUN mkdir -p /app/data

EXPOSE 8010

CMD ["sh", "-c", "python init_data.py && uvicorn main:app --host 0.0.0.0 --port 8010"]
