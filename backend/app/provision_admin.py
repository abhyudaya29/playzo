"""Trusted host-only role provisioning; never exposed as a public API.

python -m app.provision_admin --clerk-id user_... --role SUPER_ADMIN --reason 'Initial administrator'
The user must sign in once before provisioning.
"""
import argparse
import asyncio
from sqlalchemy import select
from app.database import Session, engine
from app.models import User
from app.services.platform import STAFF, audit


async def provision(args):
    async with Session() as db:
        user = await db.scalar(select(User).where(User.clerk_id == args.clerk_id).with_for_update())
        if not user: raise SystemExit("User not found. Sign in to Playzo first.")
        before = user.role
        user.role = args.role
        audit(db, user, "ADMIN_ROLE_CHANGED", "user", user.id, args.reason, before=before, after=args.role, source="trusted_cli")
        await db.commit()
        print("Role provisioned and audit record written.")
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clerk-id", required=True)
    parser.add_argument("--role", choices=sorted(STAFF | {"USER"}), required=True)
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()
    if not 5 <= len(args.reason.strip()) <= 1000: parser.error("Give a reason of 5–1000 characters")
    asyncio.run(provision(args))
