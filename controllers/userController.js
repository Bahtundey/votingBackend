const Poll = require("../models/Poll");

async function getUserVoteHistory(req, res) {
  try {
    const userId = req.user.id;

    const polls = await Poll.find({
      "votes.user": userId,
    }).sort({ endsAt: -1 });

    const history = polls.map((poll) => {
      const vote = poll.votes.find(
        (v) => v.user.toString() === userId
      );

      return {
        pollId: poll._id,
        title: poll.title,
        description: poll.description,
        choice: poll.choices[vote.choiceIndex]?.text,
        votedAt: vote.votedAt, 
      };
    });

    res.json({ history });
  } catch (err) {
    console.error("USER HISTORY ERROR:", err);
    res.status(500).json({ error: "Failed to load vote history" });
  }
}

module.exports = { getUserVoteHistory };
