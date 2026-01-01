const mongoose = require("mongoose");

const PollSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    
    choices: [
      {
        text: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],

    
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    startsAt: {
      type: Date,
      default: Date.now,
    },

    endsAt: {
      type: Date,
      required: true,
    },

    isClosed: {
      type: Boolean,
      default: false,
    },

    votes: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        choiceIndex: {
          type: Number,
          required: true,
        },
        votedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Poll", PollSchema);
