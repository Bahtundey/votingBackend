const Poll = require("../models/Poll");
const User = require("../models/User");
const sendMail = require("../utils/mailer");
const { schedulePollEnd, clearPollTimeout } = require("../utils/scheduler");



exports.createPoll = async (req, res) => {
  try {
    const { title, description, choices, endsAt } = req.body;

    if (!title || !description || !Array.isArray(choices) || choices.length < 2) {
      return res.status(400).json({ error: "Invalid poll data" });
    }

    const end = new Date(endsAt);
    if (isNaN(end) || end <= new Date()) {
      return res.status(400).json({ error: "Invalid end date" });
    }

    const poll = await Poll.create({
      title,
      description,
      choices: choices.map((c) => ({ text: c.text })),
      createdBy: req.user.id,
      endsAt: end,
    });


    schedulePollEnd(req.app.get("io"), poll);

    
    const users = await User.find({ role: "user" }).select("email name");

    for (const u of users) {
      const html = `
        <h2>🗳️ New Poll Available!</h2>
        <p>Hello ${u.name},</p>

        <p>A new poll titled <strong>${poll.title}</strong> has been created.</p>

        <p>${poll.description}</p>

        <p><strong>Poll Ends:</strong> ${new Date(poll.endsAt).toLocaleString()}</p>

        <p>Log in to <strong>VoteX</strong> to participate.</p>

        <hr />
        <p style="font-size:12px;color:#777">
          You are receiving this email because you have an account on VoteX.
        </p>
      `;

      
      sendMail(u.email, "🗳️ New Poll Created", html);
    }

    
if (process.env.ADMIN_EMAIL) {
  const adminHtml = `
    <h2>🛠️ New Poll Created</h2>

    <p>A new poll has been created by an admin.</p>

    <ul>
      <li><strong>Title:</strong> ${poll.title}</li>
      <li><strong>Description:</strong> ${poll.description}</li>
      <li><strong>Ends At:</strong> ${new Date(poll.endsAt).toLocaleString()}</li>
    </ul>

    <p>Login to the Admin Dashboard to manage this poll.</p>
  `;

  sendMail(
    process.env.ADMIN_EMAIL,
    `🛠️ New Poll Created: ${poll.title}`,
    adminHtml
  );
}


    res.status(201).json({ ok: true, poll });
  } catch (err) {
    console.error("CREATE POLL ERROR:", err);
    res.status(500).json({ error: "Failed to create poll" });
  }
};





exports.getPolls = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 5;
    const search = req.query.search || "";

    const query = search
      ? { title: { $regex: search, $options: "i" } }
      : {};

    const total = await Poll.countDocuments(query);

    const polls = await Poll.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ polls, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load polls" });
  }
};


exports.getActivePolls = async (req, res) => {
  const polls = await Poll.find({
    isClosed: false,
    endsAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  res.json({ polls });
};


exports.getHistoryPolls = async (req, res) => {
  const polls = await Poll.find({
    endsAt: { $lte: new Date() },
  }).sort({ createdAt: -1 });

  res.json({ polls });
};


exports.getPollById = async (req, res) => {
  const poll = await Poll.findById(req.params.id)
    .populate("votes.user", "name email");

  if (!poll) return res.status(404).json({ error: "Poll not found" });

  res.json({ poll });
};



exports.votePoll = async (req, res) => {
  try {
    const { choiceIndex } = req.body;
    const userId = req.user.id;

    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    if (poll.isClosed) return res.status(400).json({ error: "Poll closed" });

    if (
      typeof choiceIndex !== "number" ||
      choiceIndex < 0 ||
      choiceIndex >= poll.choices.length
    ) {
      return res.status(400).json({ error: "Invalid choice" });
    }

    if (poll.votes.some((v) => v.user.toString() === userId)) {
      return res.status(400).json({ error: "You already voted" });
    }

    
    poll.votes.push({ user: userId, choiceIndex });
    await poll.save();

    
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          voteHistory: {
            pollId: poll._id,
            choiceIndex,
          },
        },
      },
      { new: true }
    );

    
    const html = `
      <h2> Vote Confirmed</h2>

      <p>Hello ${user.name},</p>

      <p>Your vote has been successfully recorded.</p>

      <p><strong>Poll:</strong> ${poll.title}</p>
      <p><strong>Your Choice:</strong> ${poll.choices[choiceIndex].text}</p>

      <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>

      <hr />
      <p style="font-size:12px;color:#777">
        This email confirms your participation in a VoteX poll.
      </p>
    `;

    sendMail(user.email, " Vote Confirmed", html);

    
    const io = req.app.get("io");
    if (io) {
      const results = poll.choices.map(
        (_, i) => poll.votes.filter((v) => v.choiceIndex === i).length
      );
      io.to(poll._id.toString()).emit("voteUpdate", results);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("VOTE ERROR:", err);
    res.status(500).json({ error: "Vote failed" });
  }
};


/* ======================
   UPDATE POLL
====================== */
exports.updatePoll = async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    const { title, description, endsAt } = req.body;

    if (title) poll.title = title;
    if (description) poll.description = description;

    if (endsAt) {
      const date = new Date(endsAt);
      if (isNaN(date) || date <= new Date()) {
        return res.status(400).json({ error: "Invalid end date" });
      }

      poll.endsAt = date;
      clearPollTimeout(poll._id);
      schedulePollEnd(req.app.get("io"), poll);
    }

    await poll.save();
    res.json({ ok: true, poll });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
};


exports.deletePoll = async (req, res) => {
  await Poll.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};
