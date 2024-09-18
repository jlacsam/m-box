from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
import requests

class BearerAuthentication(BaseAuthentication):

    def authenticate(self, request):
        auth = request.headers.get('Authorization', None)
        if not auth:
            return None
        try:
            token_type, token = auth.split()
            if token_type.lower() != 'bearer':
                raise AuthenticationFailed('Invalid token type.')
        except ValueError:
            raise AuthenticationFailed('Invalid authorization header format.')

        # Verify the token with Azure AD
        response = requests.get(
            'https://graph.microsoft.com/v1.0/me',
            headers={'Authorization': f'Bearer {token}'}
        )
        if response.status_code != 200:
            raise AuthenticationFailed('Invalid token.')

        return (None, None)  # Authentication successful

    def authenticate_header(self, request):
        return 'Bearer realm="api"'

