const mongoose = require("mongoose");

// Single source of truth for the poll lifecycle.
// `isClosed` is kept only as a derived convenience field (see the pre-save hook)
// so existing clients that read `poll.isClosed` keep working.
const POLL_STATUS = Object.freeze({
  DRAFT: "draft",
  OPEN: "open",
  CLOSED: "closed",
});

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

    status: {
      type: String,
      enum: Object.values(POLL_STATUS),
      default: POLL_STATUS.OPEN,
    },

    // Derived from `status` on every save; never set directly by business logic.
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

// Keep the legacy boolean field in lock-step with `status`.
// Arity-0 synchronous hook: Kareem 3 (Mongoose 9) auto-advances for it.
PollSchema.pre("save", function () {
  this.isClosed = this.status === POLL_STATUS.CLOSED;
});

module.exports = mongoose.model("Poll", PollSchema);
module.exports.POLL_STATUS = POLL_STATUS;
