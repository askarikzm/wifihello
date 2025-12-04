import os
import uuid
from datetime import datetime, timedelta

import psycopg

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://netaxis:changeme@localhost:5432/netaxis_core")

SUBSCRIBERS = [
    {
        "id": uuid.uuid4(),
        "name": "Ali Raza",
        "mobile": "03001234567",
        "email": "ali@example.com",
        "cnic": "35202-1234567-1",
        "address": "Lahore",
        "region_id": uuid.uuid4(),
        "pppoe_username": "ali.raza",
        "pppoe_password_hash": "bcrypt$...",
        "status": "active",
        "package_name": "Fiber 30",
        "package_speed_down": 30,
        "package_speed_up": 10,
        "expiry_date": datetime.utcnow() + timedelta(days=25),
    }
]


def seed():
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            for sub in SUBSCRIBERS:
                cur.execute(
                    """
                    INSERT INTO subscribers (
                        id, name, mobile, email, cnic, address, region_id,
                        pppoe_username, pppoe_password_hash, status,
                        package_name, package_speed_down, package_speed_up, expiry_date
                    ) VALUES (%(id)s, %(name)s, %(mobile)s, %(email)s, %(cnic)s, %(address)s,
                              %(region_id)s, %(pppoe_username)s, %(pppoe_password_hash)s, %(status)s,
                              %(package_name)s, %(package_speed_down)s, %(package_speed_up)s, %(expiry_date)s)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    sub,
                )
        conn.commit()


if __name__ == "__main__":
    seed()
