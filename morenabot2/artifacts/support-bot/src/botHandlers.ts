import "dotenv/config";
import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { prisma } from "./db.js";

interface SessionData {
  adminState?: "idle" | "replying" | "closing";
  currentTicketId?: string;
}

type MyContext = Context & SessionFlavor<SessionData>;

const bot = new Bot<MyContext>(process.env.SUPPORT_BOT_TOKEN!);

const ADMIN_IDS = (process.env.ADMIN_IDS ?? "").split(",").map((x) => BigInt(x.trim())).filter(Boolean);

function isAdmin(ctx: MyContext): boolean {
  return ADMIN_IDS.includes(ctx.from!.id);
}

function adminKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📥 Открытые", "admin:open")
    .text("⏳ В ожидании", "admin:waiting")
    .row()
    .text("🔒 Закрытые", "admin:closed");
}

function ticketKeyboard(ticketId: string, isAdmin: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (isAdmin) {
    kb.text("✍️ Ответить", `admin:reply:${ticketId}`)
      .text("🔒 Закрыть", `admin:close:${ticketId}`).row()
      .text("📋 Все тикеты", "admin:list");
  } else {
    kb.text("✍️ Написать", `user:reply:${ticketId}`)
      .text("🔒 Закрыть", `user:close:${ticketId}`).row()
      .text("📋 Мои тикеты", "user:list");
  }
  return kb;
}

function formatTicket(t: any, isAdmin: boolean): string {
  const statusEmoji = {
    OPEN: "🟢",
    WAITING_USER: "🟡",
    WAITING_ADMIN: "🟠",
    CLOSED: "🔴",
  }[t.status];
  const userLink = t.username ? `@${t.username}` : `ID: ${t.userId}`;
  const name = [t.firstName, t.lastName].filter(Boolean).join(" ") || "—";
  const subj = t.subject ? `\n📌 ${t.subject}` : "";
  return `${statusEmoji} #${t.id.slice(0, 8)}\n👤 ${name} (${userLink})${subj}\n📅 ${new Date(t.createdAt).toLocaleString("ru-RU")}\n💬 ${t.messages.length} сообщ.`;
}

bot.use(session({ initial: () => ({}) }));

bot.command("start", async (ctx) => {
  if (isAdmin(ctx)) {
    await ctx.reply("🛠 *Панель поддержки*", { parse_mode: "Markdown", reply_markup: adminKeyboard() });
  } else {
    await ctx.reply(
      `👋 Привет! Это бот поддержки Morena VPN.\n\nНажми кнопку ниже, чтобы создать обращение.`,
      { reply_markup: new InlineKeyboard().text("📝 Создать тикет", "user:create") }
    );
  }
});

bot.callbackQuery("user:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminState = "idle";
  await ctx.reply("📝 Опишите вашу проблему или вопрос. Поддерживаете текст, фото, документы.");
  ctx.session.adminState = "creating_ticket";
});

bot.on("message:text", async (ctx) => {
  if (ctx.session.adminState === "creating_ticket" && !isAdmin(ctx)) {
    const ticket = await prisma.ticket.create({
      data: {
        userId: BigInt(ctx.from.id),
        username: ctx.from.username ?? null,
        firstName: ctx.from.first_name ?? null,
        lastName: ctx.from.last_name ?? null,
        subject: ctx.message.text.slice(0, 100),
        messages: { create: { fromUser: true, text: ctx.message.text } },
      },
      include: { messages: true },
    });
    ctx.session.adminState = "idle";
    await ctx.reply(`✅ Тикет #${ticket.id.slice(0, 8)} создан. Ожидайте ответа.`, { reply_markup: ticketKeyboard(ticket.id, false) });
    for (const adminId of ADMIN_IDS) {
      try {
        await ctx.api.sendMessage(adminId.toString(), `🔔 Новый тикет #${ticket.id.slice(0, 8)}\n${formatTicket(ticket, true)}`, { parse_mode: "Markdown", reply_markup: ticketKeyboard(ticket.id, true) });
      } catch { /* ignore */ }
    }
    return;
  }
  if (ctx.session.adminState === "replying" && isAdmin(ctx) && ctx.session.currentTicketId) {
    const ticket = await prisma.ticket.update({
      where: { id: ctx.session.currentTicketId },
      data: { status: "WAITING_USER", messages: { create: { fromUser: false, text: ctx.message.text } } },
      include: { messages: true },
    });
    ctx.session.adminState = "idle";
    ctx.session.currentTicketId = undefined;
    await ctx.reply(`✅ Ответ отправлен в тикет #${ticket.id.slice(0, 8)}`, { reply_markup: adminKeyboard() });
    try {
      await ctx.api.sendMessage(ticket.userId.toString(), `💬 Ответ поддержки по тикету #${ticket.id.slice(0, 8)}:\n\n${ctx.message.text}`, { reply_markup: ticketKeyboard(ticket.id, false) });
    } catch { /* ignore */ }
    return;
  }
  if (!isAdmin(ctx)) {
    await ctx.reply("Используйте кнопки меню для взаимодействия.", { reply_markup: new InlineKeyboard().text("📝 Создать тикет", "user:create") });
  }
});

bot.callbackQuery(/^user:list$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tickets = await prisma.ticket.findMany({ where: { userId: BigInt(ctx.from.id) }, orderBy: { createdAt: "desc" }, take: 10, include: { messages: true } });
  if (!tickets.length) return ctx.reply("📭 У вас нет тикетов.", { reply_markup: new InlineKeyboard().text("📝 Создать", "user:create") });
  const text = tickets.map((t) => formatTicket(t, false)).join("\n\n");
  await ctx.reply(`📋 *Ваши тикеты:*\n\n${text}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard().text("📝 Создать новый", "user:create") });
});

bot.callbackQuery(/^user:reply:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticketId = ctx.match[1];
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { messages: { orderBy: { createdAt: "desc" }, take: 5 } } });
  if (!ticket || ticket.userId !== BigInt(ctx.from.id)) return ctx.reply("❌ Тикет не найден.");
  if (ticket.status === "CLOSED") return ctx.reply("🔒 Тикет закрыт.");
  ctx.session.adminState = "creating_ticket";
  await ctx.reply("✍️ Напишите сообщение для поддержки:", { reply_markup: new InlineKeyboard().text("◀️ Назад", `user:ticket:${ticketId}`) });
});

bot.callbackQuery(/^user:close:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticketId = ctx.match[1];
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.userId !== BigInt(ctx.from.id)) return ctx.reply("❌ Тикет не найден.");
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: "CLOSED", closedAt: new Date(), closedBy: BigInt(ctx.from.id) } });
  await ctx.reply("🔒 Тикет закрыт.", { reply_markup: new InlineKeyboard().text("📋 Мои тикеты", "user:list") });
});

bot.callbackQuery(/^user:ticket:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticketId = ctx.match[1];
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!ticket || ticket.userId !== BigInt(ctx.from.id)) return ctx.reply("❌ Тикет не найден.");
  const msgs = ticket.messages.map((m) => `${m.fromUser ? "👤 Вы" : "🛠 Поддержка"}: ${m.text}`).join("\n\n");
  await ctx.reply(`📝 *Тикет #${ticket.id.slice(0, 8)}*\nСтатус: ${ticket.status}\n\n${msgs}`, { parse_mode: "Markdown", reply_markup: ticketKeyboard(ticket.id, false) });
});

bot.callbackQuery("admin:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const tickets = await prisma.ticket.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { messages: true } });
  const text = tickets.length ? tickets.map((t) => formatTicket(t, true)).join("\n\n") : "📭 Нет тикетов.";
  await ctx.reply(`📋 *Все тикеты:*\n\n${text}`, { parse_mode: "Markdown", reply_markup: adminKeyboard() });
});

bot.callbackQuery(/^admin:open$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const tickets = await prisma.ticket.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, include: { messages: true } });
  const text = tickets.length ? tickets.map((t) => formatTicket(t, true)).join("\n\n") : "📭 Нет открытых.";
  await ctx.reply(`🟢 *Открытые:*\n\n${text}`, { parse_mode: "Markdown", reply_markup: adminKeyboard() });
});

bot.callbackQuery(/^admin:waiting$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const tickets = await prisma.ticket.findMany({ where: { status: { in: ["WAITING_USER", "WAITING_ADMIN"] } }, orderBy: { createdAt: "desc" }, include: { messages: true } });
  const text = tickets.length ? tickets.map((t) => formatTicket(t, true)).join("\n\n") : "📭 Нет в ожидании.";
  await ctx.reply(`🟡 *В ожидании:*\n\n${text}`, { parse_mode: "Markdown", reply_markup: adminKeyboard() });
});

bot.callbackQuery(/^admin:closed$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const tickets = await prisma.ticket.findMany({ where: { status: "CLOSED" }, orderBy: { closedAt: "desc" }, take: 10, include: { messages: true } });
  const text = tickets.length ? tickets.map((t) => formatTicket(t, true)).join("\n\n") : "📭 Нет закрытых.";
  await ctx.reply(`🔴 *Закрытые:*\n\n${text}`, { parse_mode: "Markdown", reply_markup: adminKeyboard() });
});

bot.callbackQuery(/^admin:reply:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const ticketId = ctx.match[1];
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { messages: { orderBy: { createdAt: "desc" }, take: 5 } } });
  if (!ticket) return ctx.reply("❌ Тикет не найден.");
  ctx.session.adminState = "replying";
  ctx.session.currentTicketId = ticketId;
  await ctx.reply(`✍️ Ответ для тикета #${ticketId.slice(0, 8)}:\n\nНапишите сообщение:`, { reply_markup: new InlineKeyboard().text("❌ Отмена", "admin:cancel") });
});

bot.callbackQuery("admin:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.adminState = "idle";
  ctx.session.currentTicketId = undefined;
  await ctx.reply("Отменено.", { reply_markup: adminKeyboard() });
});

bot.callbackQuery(/^admin:close:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const ticketId = ctx.match[1];
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: "CLOSED", closedAt: new Date(), closedBy: BigInt(ctx.from.id) } });
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  await ctx.reply(`🔒 Тикет #${ticketId.slice(0, 8)} закрыт.`, { reply_markup: adminKeyboard() });
  if (ticket) {
    try { await ctx.api.sendMessage(ticket.userId.toString(), `🔒 Тикет #${ticketId.slice(0, 8)} закрыт поддержкой.`, { reply_markup: ticketKeyboard(ticketId, false) }); } catch { /* ignore */ }
  }
});

bot.callbackQuery(/^admin:ticket:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isAdmin(ctx)) return;
  const ticketId = ctx.match[1];
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!ticket) return ctx.reply("❌ Тикет не найден.");
  const msgs = ticket.messages.map((m) => `${m.fromUser ? "👤 Пользователь" : "🛠 Вы"}: ${m.text}`).join("\n\n");
  await ctx.reply(`📝 *Тикет #${ticket.id.slice(0, 8)}*\nСтатус: ${ticket.status}\nПользователь: ${ticket.username ? "@" + ticket.username : ticket.userId}\n\n${msgs}`, { parse_mode: "Markdown", reply_markup: ticketKeyboard(ticket.id, true) });
});

export { bot };