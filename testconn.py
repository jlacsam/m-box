import psycopg2
from psycopg2 import OperationalError

def create_connection():
    try:
        # Replace these with your actual PostgreSQL credentials
        connection = psycopg2.connect(
            user="postgres",
            password="password",
            host="10.0.0.4",  # Host IP address of the PostgreSQL server
            port="5432",  # Default PostgreSQL port
            database="mbox"
        )
        print("Connection to PostgreSQL DB successful")
        return connection
    except OperationalError as e:
        print(f"The error '{e}' occurred")
        return None

# Test the connection
if __name__ == "__main__":
    connection = create_connection()

