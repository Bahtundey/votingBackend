const Poll = require("../models/Poll");
const sendMail = require("./mailer");

const timeouts = new Map();



function schedulePollEnd(io, poll) {
  if (!poll || poll.isClosed) return;

  const end = new Date(poll.endsAt).getTime();

  if (!Number.isFinite(end)) {
    console.error("Invalid poll closing date:", poll.endsAt);
    return;
  }

  const delay = end - Date.now();

  console.log("Poll scheduling diagnostic:", {
    title: poll.title,
    endsAt: poll.endsAt,
    currentTime: new Date().toISOString(),
    delayInMilliseconds: delay,
  });

  if (delay <= 0) {
    console.warn("Poll end date has already passed:", poll.title);
    closePoll(io, poll._id);
    return;
  }

  const key = poll._id.toString();

  if (timeouts.has(key)) {
    clearTimeout(timeouts.get(key));
  }

  const timer = setTimeout(() => {
    closePoll(io, poll._id);
    timeouts.delete(key);
  }, delay);

  timeouts.set(key, timer);
}


async function closePoll(io, pollId) {
  try {
    const poll = await Poll.findById(pollId)
      .populate("votes.user", "email name");

    if (!poll || poll.isClosed) return;

    poll.isClosed = true;
    await poll.save();


    if (io) {
      io.to(pollId.toString()).emit("pollClosed", { pollId });
    }

   
    const results = poll.choices.map((c, i) => ({
      choice: c.text,
      votes: poll.votes.filter(v => v.choiceIndex === i).length,
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
          ${results.map(r => `<li>${r.choice}: ${r.votes}</li>`).join("")}
        </ul>
      `;

      await sendMail(
        process.env.ADMIN_EMAIL,
        `Poll Results: ${poll.title}`,
        adminHtml
      );
    }

    console.log(` Poll automatically closed: ${poll.title}`);

  } catch (err) {
    console.error("AUTO CLOSE ERROR:", err.message);
  }
}

module.exports = {
  schedulePollEnd,
  closePoll,
};
