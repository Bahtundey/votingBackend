const Poll = require("../models/Poll");
const { POLL_STATUS } = require("../models/Poll");
const sendMail = require("./mailer");

const openTimers = new Map();
const closeTimers = new Map();

function clearPollTimers(pollId) {
  const key = String(pollId);
  if (openTimers.has(key)) {
    clearTimeout(openTimers.get(key));
    openTimers.delete(key);
  }
  if (closeTimers.has(key)) {
    clearTimeout(closeTimers.get(key));
    closeTimers.delete(key);
  }
}

// Schedule whatever transitions a poll still needs based on its current status:
//  - draft + future startsAt  -> auto-open at startsAt (scheduled publish)
//  - open + future endsAt     -> auto-close at endsAt
//  - open + past endsAt       -> close immediately
//  - closed / manual draft    -> nothing to do
function schedulePoll(io, poll) {
  if (!poll || !poll._id) return;

  const key = String(poll._id);
  clearPollTimers(key);

  const now = Date.now();
  const startsAt = new Date(poll.startsAt).getTime();
  const endsAt = new Date(poll.endsAt).getTime();

  if (poll.status === POLL_STATUS.CLOSED) return;

  if (poll.status === POLL_STATUS.DRAFT) {
    if (Number.isFinite(startsAt) && startsAt > now) {
      const timer = setTimeout(() => {
        openPoll(io, poll._id);
        openTimers.delete(key);
      }, startsAt - now);
      openTimers.set(key, timer);
    }
    // A manually saved draft (no future start) stays draft until an admin publishes it.
    return;
  }

  if (poll.status === POLL_STATUS.OPEN) {
    if (!Number.isFinite(endsAt)) {
      console.error("Invalid poll closing date:", poll.endsAt);
      return;
    }

    if (endsAt <= now) {
      closePoll(io, poll._id);
      return;
    }

    const timer = setTimeout(() => {
      closePoll(io, poll._id);
      closeTimers.delete(key);
    }, endsAt - now);
    closeTimers.set(key, timer);
  }
}

async function openPoll(io, pollId) {
  try {
    const poll = await Poll.findById(pollId);
    if (!poll || poll.status !== POLL_STATUS.DRAFT) return;

    poll.status = POLL_STATUS.OPEN;
    await poll.save();

    if (io) {
      io.to(String(pollId)).emit("pollOpened", { pollId: String(pollId) });
    }

    console.log(`Poll opened: ${poll.title}`);
    schedulePoll(io, poll);
  } catch (err) {
    console.error("AUTO OPEN ERROR:", err.message);
  }
}

async function closePoll(io, pollId) {
  try {
    const poll = await Poll.findById(pollId)
      .populate("votes.user", "email name");

    if (!poll || poll.status === POLL_STATUS.CLOSED) return;

    poll.status = POLL_STATUS.CLOSED;
    await poll.save();

    if (io) {
      io.to(String(pollId)).emit("pollClosed", { pollId: String(pollId) });
    }

    const results = poll.choices.map((c, i) => ({
      choice: c.text,
      votes: poll.votes.filter((v) => v.choiceIndex === i).length,
    }));

    for (const vote of poll.votes) {
      if (!vote.user?.email) continue;

      const html = `
        <h2>📊 Poll Results Are In!</h2>

        <p>The poll <strong>${poll.title}</strong> has officially closed.</p>

        <p><strong>Your Choice:</strong> ${poll.choices[vote.choiceIndex].text}</p>

        <h3>Final Results:</h3>
        <ul>
          ${results
            .map(
              (r) => `<li><strong>${r.choice}</strong>: ${r.votes} votes</li>`
            )
            .join("")}
        </ul>

        <p>Thank you for voting on VoteX!</p>
      `;

      sendMail(vote.user.email, `📊 Results: ${poll.title}`, html);
    }

    if (process.env.ADMIN_EMAIL) {
      const adminHtml = `
        <h2>Poll Ended</h2>
        <p>${poll.title}</p>
        <ul>
          ${results.map((r) => `<li>${r.choice}: ${r.votes}</li>`).join("")}
        </ul>
      `;

      await sendMail(
        process.env.ADMIN_EMAIL,
        `Poll Results: ${poll.title}`,
        adminHtml
      );
    }

    console.log(`Poll automatically closed: ${poll.title}`);
  } catch (err) {
    console.error("AUTO CLOSE ERROR:", err.message);
  }
}

module.exports = {
  schedulePoll,
  openPoll,
  closePoll,
  clearPollTimers,
};
