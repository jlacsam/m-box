#!/bin/bash

# Add a user named admin with a password
useradd -m -s /bin/bash user
echo "admin:ffffffff" | chpasswd

# Make sudo require a password
echo "admin ALL=(ALL) ALL" >> /etc/sudoers

# Switch to the new user
sudo -u admin /bin/bash

# Run bash as admin (it will ask for the admin password when accessing)
exec /bin/bash

