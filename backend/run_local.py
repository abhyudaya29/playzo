"""Run the API from a local Python environment with Docker PostGIS and Valkey."""
import argparse
import os
from pathlib import Path
import sys
from urllib.parse import quote

from dotenv import dotenv_values


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evolve", action="store_true", help="Apply local SQL evolutions and exit")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    env = {key: value for key, value in dotenv_values(root / ".env").items() if value is not None}
    env.update(os.environ)
    password = quote(env.get("POSTGRES_PASSWORD", "playzo"), safe="")
    # These are the host ports published by docker-compose.yml.
    env["DATABASE_URL"] = f"postgresql+asyncpg://playzo:{password}@127.0.0.1:5433/playzo"
    env["VALKEY_URL"] = "redis://127.0.0.1:6379/0"
    # Next selects 3001 when another local frontend is using 3000.
    origins = env.get("FRONTEND_ORIGINS", "http://localhost:3000").split(",")
    env["FRONTEND_ORIGINS"] = ",".join(dict.fromkeys([
        *origins, "http://localhost:3000", "http://localhost:3001",
        "http://127.0.0.1:3000", "http://127.0.0.1:3001",
    ]))
    command = [sys.executable, "-m"]
    if args.evolve:
        command += ["app.evolve"]
    else:
        command += ["uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(args.port)]
    os.chdir(root / "backend")
    os.execvpe(sys.executable, command, env)


if __name__ == "__main__":
    main()
