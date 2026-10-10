import { downloadBrowserExport } from "@/features/browser-export";
import type { PrivateWork } from "@/auth/private-work";

describe("browser export handoff", () => {
  const click = jest.fn();
  const remove = jest.fn();
  const appendChild = jest.fn();
  const revoke = jest.fn();
  const create = jest.fn(() => "blob:private-export");
  const previousDocument = globalThis.document;
  const previousCreate = URL.createObjectURL;
  const previousRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => ({ style: {}, click, remove }),
        body: { appendChild },
      },
    });
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
  });
  afterAll(() => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previousDocument,
    });
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
  });

  it("downloads current bytes and releases the temporary URL", () => {
    const assertCurrent = jest.fn();
    downloadBrowserExport(new ArrayBuffer(8), {
      assertCurrent,
    } as unknown as PrivateWork);
    expect(click).toHaveBeenCalledTimes(1);
    expect(assertCurrent).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:private-export");
  });

  it("does not hand bytes to the browser after authority becomes stale", () => {
    const assertCurrent = jest
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("stale work");
      });
    expect(() =>
      downloadBrowserExport(new ArrayBuffer(8), {
        assertCurrent,
      } as unknown as PrivateWork),
    ).toThrow("stale work");
    expect(click).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:private-export");
  });
});
