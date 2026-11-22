import { botCall, codeIsWaiting, readUpdate, secretMatches, telegramBot, vouch } from "@/lib/telegram-login"

export const runtime = "nodejs"

const SITE = "service.noctorium.xyz"

/**
 * Updates from Telegram for the login bot. /start <code> asks the listener to confirm; Confirm vouches for the code with
 * who pressed it, as Telegram says. Always answers 200, so Telegram does not send an update again.
 */
export async function POST(request: Request) {
  const bot = telegramBot()
  if (!bot || !secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), bot.token)) {
    return new Response(null, { status: 401 })
  }
  const asked = readUpdate(await request.json().catch(() => null))

  if (asked.kind === "start") {
    if (asked.code && (await codeIsWaiting(asked.code))) {
      await botCall(bot.token, "sendMessage", {
        chat_id: asked.chat,
        text: `Sign in to Noctorium as you?\n\nOnly confirm if you pressed "Continue with Telegram" on ${SITE} yourself, just now.`,
        reply_markup: { inline_keyboard: [[{ text: "✅ Confirm", callback_data: `ok:${asked.code}` }]] },
      })
    } else {
      await botCall(bot.token, "sendMessage", {
        chat_id: asked.chat,
        text: asked.code
          ? `That sign-in has expired. Press "Continue with Telegram" on ${SITE} again.`
          : `To sign in to Noctorium, press "Continue with Telegram" on ${SITE}.`,
      })
    }
  }

  if (asked.kind === "confirm") {
    const done = await vouch(asked.code, asked.profile)
    await botCall(bot.token, "answerCallbackQuery", { callback_query_id: asked.callback })
    await botCall(bot.token, "editMessageText", {
      chat_id: asked.chat,
      message_id: asked.message,
      text: done
        ? "✅ Signed in to Noctorium. Go back to your browser."
        : `That sign-in has expired or was already used. Press "Continue with Telegram" on ${SITE} again.`,
    })
  }

  return new Response(null, { status: 200 })
}
