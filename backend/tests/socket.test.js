const { createSocketEventBridge } = require("../config/socket");

describe("Socket event bridge", () => {
  it("emits both internal and public alias events for room-scoped answer events", () => {
    const roomEmit = jest.fn();
    const io = {
      emit: jest.fn(),
      to: jest.fn(() => ({
        emit: roomEmit,
      })),
    };

    const bridge = createSocketEventBridge(io);
    bridge.to("question_1").emit("answer:official_created", { id: "a1" });

    expect(io.to).toHaveBeenCalledWith("question_1");
    expect(roomEmit).toHaveBeenNthCalledWith(1, "answer:official_created", {
      id: "a1",
    });
    expect(roomEmit).toHaveBeenNthCalledWith(2, "official_answer_created", {
      id: "a1",
    });
  });

  it("passes through events without aliases unchanged", () => {
    const io = {
      emit: jest.fn(),
      to: jest.fn(() => ({
        emit: jest.fn(),
      })),
    };

    const bridge = createSocketEventBridge(io);
    bridge.emit("question_status_updated", { questionId: "q1" });

    expect(io.emit).toHaveBeenCalledTimes(1);
    expect(io.emit).toHaveBeenCalledWith("question_status_updated", {
      questionId: "q1",
    });
  });
});
