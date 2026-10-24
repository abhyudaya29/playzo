"""Fail a release if the running API is missing routes from the built image."""
import argparse
import json
from urllib.request import urlopen

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}


def operations(schema: dict) -> set[tuple[str, str]]:
    return {
        (method.upper(), path)
        for path, item in schema["paths"].items()
        for method in item
        if method in HTTP_METHODS
    }


def verify_routes(expected: dict, deployed: dict) -> None:
    missing = operations(expected) - operations(deployed)
    if missing:
        routes = ", ".join(f"{method} {path}" for method, path in sorted(missing))
        raise RuntimeError(
            f"Running API is missing routes: {routes}. "
            "Rebuild/recreate the API container and check the reverse proxy upstream."
        )


def main() -> None:
    from app.main import app

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://api:8000")
    args = parser.parse_args()
    with urlopen(args.url.rstrip("/") + "/openapi.json", timeout=10) as response:
        deployed = json.load(response)
    verify_routes(app.openapi(), deployed)
    print(f"Verified {len(operations(app.openapi()))} API operations on {args.url}.")


if __name__ == "__main__":
    main()
