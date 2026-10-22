# Validator alert bot

Telegram alerts for **validator operators**. This is its own project. It does not share a bot, a token, or a database with the Open Solana Hub delegator bot.

A chat watches vote accounts on mainnet or testnet. About once a minute, a check running off your laptop reads the public network. When a watched validator stops voting, the chat gets one message and the reason the network can show. When it votes again, the chat gets one more message.

The laptop can be shut. The check runs on GitHub and calls this project on Vercel.

## What a person sends

In a private chat with this bot:

- a vote account, to watch it on mainnet
- `/watch testnet <vote account>`
- `/list`
- `/unwatch <vote account>`
- `/check` to read every watched validator now

The bot refuses a seed phrase or a keypair. The alarm is the **vote account**. The identity is read from the chain and is used only to say whether the machine is still online.

## Deploy this project on its own

1. Create the bot in [@BotFather](https://t.me/BotFather) with `/newbot`. Keep that token out of the Hub project.
2. Create a **new** Vercel project from this folder. Do not add these variables to Open Solana Hub.
3. On that new project, create Storage → KV.
4. Set the variables from [`.env.example`](.env.example). `VALIDATOR_ALERT_BOT_TOKEN` is the new BotFather token. `CRON_SECRET` and `VALIDATOR_ALERT_WEBHOOK_SECRET` are two long random strings you invent.
5. Deploy.
6. Register the webhook, once:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-PROJECT.vercel.app/api/setup
```

7. On the GitHub repository for **this** project, add two secrets: `CHECK_URL` (`https://YOUR-PROJECT.vercel.app/api/check`) and `CRON_SECRET` (the same secret as on Vercel). The workflow [`.github/workflows/check.yml`](.github/workflows/check.yml) then checks every minute without this laptop.

Vercel’s free plan can only run its own timer once a day, so the timer is GitHub, not the Vercel cron. The Hub project is not involved.

## First watch

After you press Start in the new bot, send the mainnet vote account:

`3QPGLackJy5LKctYYoPGmA4P8ncyE197jdxr1zP2ho8K`

Another operator does the same with their own vote account. They receive only their own alerts.
