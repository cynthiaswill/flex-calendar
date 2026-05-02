import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

type HoursData = { [date: string]: number };

const FILE = path.join(__dirname, "hours-data.json");

const MAX_DAY = 8;
const MAX_WEEK = 24;

// =====================
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[94m";

const c = (t: string, col: string) => `${col}${t}${RESET}`;

const ask = (rl: readline.Interface, q: string) =>
  new Promise<string>((r) => rl.question(q, r));

// =====================
function load(): HoursData {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

function save(d: HoursData) {
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}

function toLocalDate(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// =====================
function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function fmt(d: Date) {
  const local = toLocalDate(d);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayName(d: Date) {
  return toLocalDate(d).toLocaleDateString("en-GB", { weekday: "short" });
}

// =====================
function rolling7(data: HoursData, dates: Date[], i: number) {
  let sum = 0;
  for (let x = i - 6; x <= i; x++) {
    if (x < 0) continue;
    sum += data[fmt(dates[x])] ?? 0;
  }
  return sum;
}

function available(data: HoursData, dates: Date[], i: number) {
  const spent = data[fmt(dates[i])] ?? 0;

  let worstCase = 0;

  for (let start = i - 6; start <= i; start++) {
    let sum = 0;

    for (let k = 0; k < 7; k++) {
      const idx = start + k;
      if (idx < 0 || idx >= dates.length) continue;
      sum += data[fmt(dates[idx])] ?? 0;
    }

    if (sum > worstCase) worstCase = sum;
  }

  const weekly = Math.max(0, MAX_WEEK - worstCase);
  const daily = Math.max(0, MAX_DAY - spent);

  return Math.min(daily, weekly);
}

// =====================
async function handleDay(rl: readline.Interface, data: HoursData, d: Date) {
  const key = fmt(d);
  const label = dayName(d);

  if (data[key] !== undefined) {
    const ans = await ask(rl, `${key} (${label}) has ${data[key]}h — change? (y/n): `);
    if (ans.toLowerCase() !== "y") return;
  }

  const input = await ask(rl, `Enter hours for ${key} (${label}) (max 8): `);
  const h = parseFloat(input);

  if (!isNaN(h)) data[key] = Math.min(h, MAX_DAY);
}

// =====================
function fmtDateCell(d: Date, today: Date) {
  const diff = Math.floor(
    (toLocalDate(d).getTime() - toLocalDate(today).getTime()) / 86400000
  );

  const base = fmt(d).padEnd(10);

  if (diff < 0) return c(base, RED);
  if (diff === 0) return c(base, BLUE);
  return c(base, GREEN);
}

function fmtDayCell(d: Date, today: Date) {
  const diff = Math.floor(
    (toLocalDate(d).getTime() - toLocalDate(today).getTime()) / 86400000
  );

  const base = dayName(d).padEnd(10);

  if (diff < 0) return c(base, RED);
  if (diff === 0) return c(base, BLUE);
  return c(base, GREEN);
}

function fmtAvail(v: number) {
  const base = v.toFixed(1).padStart(9);

  if (v < 1) return c(base, RED);
  if (v < 2) return c(base, YELLOW);
  return c(base, GREEN);
}

// =====================
async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const data = load();

  const today = new Date();

  // =====================
  const baseDates: Date[] = [];
  for (let i = -6; i <= 7; i++) {
    baseDates.push(addDays(today, i));
  }

  console.log("\n📅 FLEX CALENDAR\n");

  // =====================
  // NEW MASTER PROMPT
  // =====================
  const doInput = await ask(rl, "Do you want to input or update hours? (y/n): ");

  let finalDates = [...baseDates];

  if (doInput.toLowerCase() === "y") {
    const full = baseDates.every((d) => data[fmt(d)] !== undefined);

    if (full) {
      const ans = await ask(
        rl,
        "All 14 days filled. Change today + next 7 days? (y/n): "
      );

      if (ans.toLowerCase() === "y") {
        for (let i = 6; i < baseDates.length; i++) {
          await handleDay(rl, data, baseDates[i]);
        }
      }
    } else {
      for (let i = 6; i < baseDates.length; i++) {
        await handleDay(rl, data, baseDates[i]);
      }
    }

    const extend = await ask(
      rl,
      "Do you want to extend the plan by another 7 days? (y/n): "
    );

    if (extend.toLowerCase() === "y") {
      const extraDates: Date[] = [];

      for (let i = 8; i <= 14; i++) {
        const d = addDays(today, i);
        extraDates.push(d);
        await handleDay(rl, data, d);
      }

      finalDates = finalDates.concat(extraDates);
    }

    save(data);
  }

  // =====================
  // OUTPUT
  // =====================
  console.log("\n📊 CALENDAR\n");
  console.log(
    "Date       | Day        | Spent  | Available | 7-Day Total | 7-Day Remaining"
  );
  console.log(
    "-----------------------------------------------------------------------------"
  );

  const todayIndex = 6;

  for (let i = 0; i < finalDates.length; i++) {
    const d = finalDates[i];
    const key = fmt(d);
    const spent = data[key] ?? 0;

    const dateCell = fmtDateCell(d, today);
    const dayCell = fmtDayCell(d, today);

    const avail =
      i >= todayIndex ? fmtAvail(available(data, finalDates, i)) : "-".padStart(9);

    let rolling = "-".padStart(11);
    let remaining = "-".padStart(11);

    const isTuesday = dayName(d) === "Tue";
    const isPast = toLocalDate(d).getTime() < toLocalDate(today).getTime();

    if (isTuesday && !isPast) {
      const total = rolling7(data, finalDates, i);
      rolling = total.toFixed(1).padStart(11);
      remaining = (24 - total).toFixed(1).padStart(11);
    }

    console.log(
      `${dateCell} | ${dayCell} | ${spent.toFixed(1).padStart(6)} | ${avail} | ${rolling} | ${remaining}`
    );
  }

  console.log("\nRules:");
  console.log("• Max 8 hours/day");
  console.log("• Max 24 hours rolling 7 days");

  rl.close();
}

main();
