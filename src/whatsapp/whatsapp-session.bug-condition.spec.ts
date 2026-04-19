/**
 * Bug Condition Exploration Test — Task 1
 *
 * Property 1: Bug Condition — Envío a número no guardado como contacto
 *
 * Validates: Requirements 1.1, 1.2
 *
 * CRITICAL: This test MUST FAIL on unfixed code.
 * Failure confirms the bug exists: the unfixed code throws
 * "No se encontró el contacto" instead of returning { success: true }.
 *
 * DO NOT attempt to fix the test or the code when it fails.
 * This test encodes the expected behavior — it will validate the fix
 * when it passes after implementation (Task 3).
 */

import { WhatsappSession } from './whatsapp-session.service';

// ---------------------------------------------------------------------------
// Helpers to build a minimal Puppeteer page mock
// ---------------------------------------------------------------------------

/**
 * Build a mock Puppeteer page that simulates a number NOT in the contact list.
 *
 * Behavior:
 *  - page.$()  returns a fake element for new-chat-btn and chat-list-search
 *              so those steps succeed.
 *  - page.waitForSelector() throws a TimeoutError for the contact-result
 *              selectors (cell-frame-container, chat-list-item, role="listitem")
 *              simulating that the number is not in the contacts list.
 *  - page.waitForSelector() succeeds for the compose-box selector so the
 *              message-typing step would work if the code ever reached it.
 *  - page.keyboard.type() and page.keyboard.press() are no-ops.
 *  - page.$() returns a fake element for compose-btn-send.
 */
function buildPageMock() {
  // Selectors that represent "contact found in list" — these must time out
  const contactResultSelectors = new Set([
    'div[data-testid="cell-frame-container"]',
    'div[data-testid="chat-list-item"]',
    'div[role="listitem"]',
  ]);

  // Selectors for the compose box — these must succeed so the test isolates
  // the failure to the contact-search step
  const composeBoxSelectors = new Set([
    'div[data-testid="conversation-compose-box-input"]',
    'div[contenteditable="true"][data-tab="10"]',
    'footer div[contenteditable="true"]',
    'div[contenteditable="true"]',
  ]);

  // A minimal fake element that supports click()
  const fakeElement = {
    click: jest.fn().mockResolvedValue(undefined),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
    boundingBox: jest.fn().mockResolvedValue({ width: 200, height: 200 }),
  };

  const pageMock = {
    // page.$() — returns fakeElement for known selectors, null otherwise
    $: jest.fn().mockImplementation((selector: string) => {
      // new-chat-btn selectors
      if (
        selector.includes('new-chat-btn') ||
        selector.includes('new-chat-outline') ||
        selector.includes('aria-label="New chat"')
      ) {
        return Promise.resolve(fakeElement);
      }
      // search input selectors
      if (
        selector.includes('chat-list-search') ||
        selector.includes('data-tab="3"') ||
        selector.includes('input[type="text"]')
      ) {
        return Promise.resolve(fakeElement);
      }
      // compose box selectors
      if (
        selector.includes('conversation-compose-box-input') ||
        selector.includes('data-tab="10"') ||
        selector.includes('footer div[contenteditable') ||
        (selector.includes('contenteditable') && !selector.includes('data-tab="3"'))
      ) {
        return Promise.resolve(fakeElement);
      }
      // send button
      if (
        selector.includes('compose-btn-send') ||
        selector.includes('aria-label="Send"') ||
        selector.includes('aria-label="Enviar"') ||
        selector.includes('data-icon="send"')
      ) {
        return Promise.resolve(fakeElement);
      }
      return Promise.resolve(null);
    }),

    // page.waitForSelector() — throws for contact-result selectors, resolves otherwise
    waitForSelector: jest.fn().mockImplementation((selector: string) => {
      if (contactResultSelectors.has(selector)) {
        return Promise.reject(
          new Error(`Waiting for selector "${selector}" failed: Timeout exceeded`),
        );
      }
      if (composeBoxSelectors.has(selector)) {
        return Promise.resolve(fakeElement);
      }
      // search input selectors — succeed
      return Promise.resolve(fakeElement);
    }),

    // keyboard interactions — no-ops
    keyboard: {
      type: jest.fn().mockResolvedValue(undefined),
      press: jest.fn().mockResolvedValue(undefined),
    },

    // page.goto() — no-op (not called in unfixed code for this path)
    goto: jest.fn().mockResolvedValue(undefined),

    // page.evaluate() — returns empty string (used for debug logging)
    evaluate: jest.fn().mockResolvedValue(''),

    // page.url() — returns a plausible URL
    url: jest.fn().mockReturnValue('https://web.whatsapp.com'),

    // page.title() — returns a plausible title
    title: jest.fn().mockResolvedValue('WhatsApp'),

    // page.setUserAgent() — no-op
    setUserAgent: jest.fn().mockResolvedValue(undefined),
  };

  return { pageMock, fakeElement };
}

// ---------------------------------------------------------------------------
// Inject mocked page into a WhatsappSession instance
// ---------------------------------------------------------------------------

function buildReadySession(pageMock: ReturnType<typeof buildPageMock>['pageMock']): WhatsappSession {
  const session = new WhatsappSession('test-session');

  // Access private fields via type assertion to inject mocks
  const s = session as any;
  s.isReady = true;
  s.page = pageMock;

  return session;
}

// ---------------------------------------------------------------------------
// Bug Condition Exploration Tests
// ---------------------------------------------------------------------------

describe('WhatsappSession.sendMessage — Bug Condition Exploration (Property 1)', () => {
  /**
   * Validates: Requirements 1.1, 1.2
   *
   * EXPECTED OUTCOME ON UNFIXED CODE: FAIL
   * The unfixed code throws "No se encontró el contacto +5491199999999"
   * instead of returning { success: true }.
   *
   * This failure IS the counterexample that proves the bug exists.
   */
  it('should return { success: true } when phone is not in contacts (number not in agenda)', async () => {
    const { pageMock } = buildPageMock();
    const session = buildReadySession(pageMock);

    // isBugCondition(X) = true: number not in contacts list
    const result = await session.sendMessage('5491199999999', 'Hola');

    expect(result).toEqual({ success: true });
  });

  /**
   * Validates: Requirements 1.1, 1.2
   *
   * Same bug condition with a number that has a leading '+'.
   * EXPECTED OUTCOME ON UNFIXED CODE: FAIL
   */
  it('should return { success: true } when phone with + prefix is not in contacts', async () => {
    const { pageMock } = buildPageMock();
    const session = buildReadySession(pageMock);

    const result = await session.sendMessage('+5491199999999', 'Test message');

    expect(result).toEqual({ success: true });
  });

  /**
   * Validates: Requirements 1.1, 1.2
   *
   * Parameterized: multiple phone numbers not in contacts.
   * EXPECTED OUTCOME ON UNFIXED CODE: FAIL for every case.
   */
  const phonesNotInContacts = [
    '5491100000001',
    '5491100000002',
    '+5491100000003',
    '1234567890',
    '+19876543210',
  ];

  test.each(phonesNotInContacts)(
    'should return { success: true } for phone "%s" not in contacts',
    async (phone) => {
      const { pageMock } = buildPageMock();
      const session = buildReadySession(pageMock);

      const result = await session.sendMessage(phone, 'Mensaje de prueba');

      expect(result).toEqual({ success: true });
    },
  );
});
