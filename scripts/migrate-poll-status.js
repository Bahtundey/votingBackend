#!/usr/bin/env node
/**
 * One-off migration: backfill the new `status` field on existing polls.
 *
 * SAFE / IDEMPOTENT:
 *  - Never reopens a legitimately closed poll.
 *  - Only derives `status` from the pre-existing `isClosed` + dates when
 *    `status` is not already set.
 *  - Dry-run by default; pass --apply to write changes.
 *
 * Usage:
 *   node scripts/migrate-poll-status.js            # preview only
 *   node scripts/migrate-poll-status.js --apply    # write changes
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { POLL_STATUS } = require("../models/Poll");

const APPLY = process.argv.includes("--apply");
const VALID = new Set(Object.values(POLL_STATUS));

function deriveStatus(poll) {
  const now = Date.now();
  const startsAt = new Date(poll.startsAt).getTime();
  const endsAt = new Date(poll.endsAt).getTime();

  if (poll.isClosed === true) return POLL_STATUS.CLOSED;
  if (poll.isClosed === false) {
    if (Number.isFinite(endsAt) && endsAt <= now) return POLL_STATUS.CLOSED;
    if (Number.isFinite(startsAt) && startsAt > now) return POLL_STATUS.DRAFT;
    return POLL_STATUS.OPEN;
  }
  // isClosed missing (shouldn't happen) — infer from dates only.
  if (Number.isFinite(endsAt) && endsAt <= now) return POLL_STATUS.CLOSED;
  return POLL_STATUS.OPEN;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to .env first.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected. Scanning polls...\n");

  const polls = await mongoose.connection
    .collection("polls")
    .find({})
    .toArray();

  const changes = [];
  let skipped = 0;

  for (const poll of polls) {
    if (poll.status && VALID.has(poll.status)) {
      skipped += 1;
      continue;
    }

    const status = deriveStatus(poll);
    const isClosed = status === POLL_STATUS.CLOSED;

    changes.push({
      id: String(poll._id),
      title: poll.title,
      oldIsClosed: poll.isClosed,
      endsAt: poll.endsAt,
      newStatus: status,
    });

    if (APPLY) {
      await mongoose.connection.collection("polls").updateOne(
        { _id: poll._id },
        { $set: { status, isClosed } }
      );
    }
  }

  console.log(`Total polls scanned : ${polls.length}`);
  console.log(`Already migrated   : ${skipped}`);
  console.log(`Needs migration    : ${changes.length}`);
  console.log(`Mode               : ${APPLY ? "APPLIED" : "DRY-RUN (no changes written)"}`);
  console.log("");

  for (const c of changes) {
    console.log(
      `- ${c.id}  "${c.title}"  isClosed=${c.oldIsClosed}  ->  status=${c.newStatus}`
    );
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
