FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
# Index lookup failures can exit pip even after its HTTP retries are exhausted.
RUN --mount=type=cache,target=/root/.cache/pip \
    set -eu; \
    for attempt in 1 2 3; do \
        if python -m pip install --disable-pip-version-check --prefer-binary \
            --timeout 120 --retries 5 -r requirements.txt; then \
            break; \
        fi; \
        if [ "$attempt" -eq 3 ]; then exit 1; fi; \
        echo "Package installation failed; retrying with cached downloads (attempt $((attempt + 1))/3)..."; \
    done
COPY app ./app
COPY evolutions ./evolutions
CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]
