## Archipelago Integration

This bot supports Archipelago integration using the `/ap_create` command.

### Usage

1. Set the category ID for Archipelago channels in your `.env` file:
	```
	AP_CATEGORY_ID=YOUR_CATEGORY_ID
	```
2. Use the slash command `/ap_create` with the game ID and a friendly channel name.
3. The bot will create a channel and post Archipelago events there.

### Requirements

- The bot must have permission to create channels and send messages in the target category.
- The `archipelago.js` library is required (already installed).

### Notes

- The Archipelago server hostname and port are set in `commands/ap_create.js`. Change them if you are using a private server.

# Commands
Documentation coming soon...

# To Do
remove inventory cards
remove wishlist cards
remove things in bulk
create 'trades'
emphasis on specific prints
use take and skip when selecting to reduce overhead time