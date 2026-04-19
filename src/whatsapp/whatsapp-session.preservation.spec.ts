/**
 * Preservation Property Tests — Task 2
 *
 * Property 2: Preservation — Comportamiento inalterado para entradas sin bug
 *
 * Validates: Requirements 3.1, 3.2, 3.3
 *
 * These tests capture the BASELINE behavior of the UNFIXED code for inputs
 * where isBugCondition(X) is FALSE (i.e., the bug is NOT triggered):
 *
 *   1. isReady guard (Req 3.3): sendMessage with isReady=false always throws
 *      "Sesión no lista" before any browser interaction.
 *
 *   2. Message typing preservation (Req 3.2): For valid sessions with the
 *      compose box reachable, keyboard.type is called with the exact message.
 *
 *   3. Return value preservation (Req 3.1, 3.2): For valid sessions with the
 *      compose box reachable, sendMessage returns { success: true }.
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: ALL TESTS PASS.
 * These tests confirm the baseline behavior that must not regress after the fix.
 */

import { WhatsappSession } from './whatsapp-session.service';

// ---------------------------------------------------------------------------
// Helpers to build Puppeteer page mocks
// ---------------------------------------------------------------------------

/**
 * Build a mock Puppeteer page that simulates the NON-BUG case:
 * the number IS found in the contacts list, so the unfixed code can proceed
 * all the way to the compose box.
 *
 * Behavior:
 *  - new-chat-btn IS found
 *  - search input IS found
 *  - contact result selectors (cell-frame-container, chat-list-item,
 *    role="listitem") DO return a result (number is in contacts)
 *  - compose box IS found
 *  - keyboard.type and keyboard.press are jest mocks for assertions
 *  - send button IS found
 */
function buildContactFoundPageMock() {
  // A minimal fake element that supports click()
  const fakeElement = {
    click: jest.fn().mockResolvedValue(undefined),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('')),
    boundingBox: jest.fn().mockResolvedValue({ width: 200, height: 200 }),
  };

  const keyboardMock = {
    type: jest.fn().mockResolvedValue(undefined),
    press: jest.fn().mockResolvedValue(undefined),
  };

  const pageMock = {
    // page.$() — returns fakeElement for all relevant selectors
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
      // contact result selectors — found (non-bug case)
      if (
        selector.includes('cell-frame-container') ||
        selector.includes('chat-list-item') ||
        selector.includes('role="listitem"')
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

    // page.waitForSelector() — succeeds for all selectors (contact IS found)
    waitForSelector: jest.fn().mockImplementation((_selector: string) => {
      return Promise.resolve(fakeElement);
    }),

    // keyboard interactions — jest mocks for assertions
    keyboard: keyboardMock,

    // page.goto() — no-op
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

  return { pageMock, fakeElement, keyboardMock };
}

// ---------------------------------------------------------------------------
// Inject mocked page into a WhatsappSession instance
// ---------------------------------------------------------------------------

function buildSession(
  pageMock: ReturnType<typeof buildContactFoundPageMock>['pageMock'],
  isReady: boolean,
): WhatsappSession {
  const session = new WhatsappSession('test-session');
  const s = session as any;
  s.isReady = isReady;
  s.page = pageMock;
  return session;
}

// ---------------------------------------------------------------------------
// Property 1: isReady guard (Req 3.3)
//
// For any { phone, message } with isReady = false, sendMessage always throws
// "Sesión no lista" immediately, before any browser interaction.
//
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe('WhatsappSession.sendMessage — Preservation: isReady guard (Req 3.3)', () => {
  /**
   * Validates: Requirements 3.3
   *
   * Parameterized over a variety of phone/message combinations.
   * When isReady = false, the error must be thrown before any page interaction.
   */
  const notReadyCases: Array<{ phone: string; message: string }> = [
    { phone: '5491199999999', message: 'Hola' },
    { phone: '+5491199999999', message: 'Test message' },
    { phone: '1234567890', message: 'Hello' },
    { phone: '+19876543210', message: 'Hi there' },
    { phone: '5493413646222', message: 'Mensaje' },
    { phone: '', message: '' },
    { phone: '0000000000', message: 'a'.repeat(500) },
  ];

  test.each(notReadyCases)(
    'throws "Sesión no lista" for phone="$phone" message="$message" when isReady=false',
    async ({ phone, message }) => {
      const { pageMock } = buildContactFoundPageMock();
      const session = buildSession(pageMock, false);

      await expect(session.sendMessage(phone, message)).rejects.toThrow('Sesión no lista');

      // No browser interaction should have occurred
      expect(pageMock.$).not.toHaveBeenCalled();
      expect(pageMock.waitForSelector).not.toHaveBeenCalled();
      expect(pageMock.keyboard.type).not.toHaveBeenCalled();
      expect(pageMock.keyboard.press).not.toHaveBeenCalled();
      expect(pageMock.goto).not.toHaveBeenCalled();
    },
  );

  it('throws "Sesión no lista" for any phone when isReady=false (property: all inputs)', async () => {
    const phones = [
      '5491100000001',
      '5491100000002',
      '+5491100000003',
      '1234567890',
      '+19876543210',
      '0',
      'abc',
    ];

    for (const phone of phones) {
      const { pageMock } = buildContactFoundPageMock();
      const session = buildSession(pageMock, false);

      await expect(session.sendMessage(phone, 'any message')).rejects.toThrow('Sesión no lista');
      expect(pageMock.$).not.toHaveBeenCalled();
      expect(pageMock.keyboard.type).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// Property 2: Message typing preservation (Req 3.2)
//
// For valid sessions with compose box reachable, keyboard.type is called
// with the exact message string.
//
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

describe('WhatsappSession.sendMessage — Preservation: message typing (Req 3.2)', () => {
  /**
   * Validates: Requirements 3.2
   *
   * Parameterized over a variety of message strings.
   * keyboard.type must be called with the exact message passed to sendMessage.
   */
  const messageCases: Array<{ phone: string; message: string }> = [
    { phone: '5493413646222', message: 'Hola' },
    { phone: '5493413646222', message: 'Hello, how are you?' },
    { phone: '5493413646222', message: 'Mensaje con acentos: áéíóú ñ' },
    { phone: '5493413646222', message: '1234567890' },
    { phone: '5493413646222', message: 'Multi\nline\nmessage' },
    { phone: '5493413646222', message: 'Special chars: !@#$%^&*()' },
    { phone: '5493413646222', message: 'a'.repeat(200) },
    { phone: '+5493413646222', message: 'Message with + prefix phone' },
    { phone: '1234567890', message: 'Short' },
  ];

  test.each(messageCases)(
    'keyboard.type is called with exact message "$message" for phone "$phone"',
    async ({ phone, message }) => {
      const { pageMock, keyboardMock } = buildContactFoundPageMock();
      const session = buildSession(pageMock, true);

      await session.sendMessage(phone, message);

      // keyboard.type must have been called with the exact message
      expect(keyboardMock.type).toHaveBeenCalledWith(message, expect.anything());
    },
  );

  it('keyboard.type is called with the exact message for all message variants (property)', async () => {
    const messages = [
      'simple',
      'con espacios y más',
      '   leading spaces',
      'trailing spaces   ',
      '\ttab\tcharacters',
      'emoji: 😀🎉',
    ];

    for (const message of messages) {
      const { pageMock, keyboardMock } = buildContactFoundPageMock();
      const session = buildSession(pageMock, true);

      await session.sendMessage('5493413646222', message);

      expect(keyboardMock.type).toHaveBeenCalledWith(message, expect.anything());
    }
  }, 30000);
});

// ---------------------------------------------------------------------------
// Property 3: Return value preservation (Req 3.1, 3.2)
//
// For valid sessions with compose box reachable, sendMessage returns
// { success: true }.
//
// Validates: Requirements 3.1, 3.2
// ---------------------------------------------------------------------------

describe('WhatsappSession.sendMessage — Preservation: return value (Req 3.1, 3.2)', () => {
  /**
   * Validates: Requirements 3.1, 3.2
   *
   * Parameterized over a variety of phone/message combinations.
   * sendMessage must return { success: true } for valid sessions.
   */
  const validCases: Array<{ phone: string; message: string }> = [
    { phone: '5493413646222', message: 'Hola' },
    { phone: '+5493413646222', message: 'Hello' },
    { phone: '1234567890', message: 'Test' },
    { phone: '+19876543210', message: 'Message' },
    { phone: '5491100000001', message: 'Mensaje de prueba' },
    { phone: '5491100000002', message: 'Another message' },
  ];

  test.each(validCases)(
    'returns { success: true } for phone="$phone" message="$message"',
    async ({ phone, message }) => {
      const { pageMock } = buildContactFoundPageMock();
      const session = buildSession(pageMock, true);

      const result = await session.sendMessage(phone, message);

      expect(result).toEqual({ success: true });
    },
  );

  it('always returns { success: true } for valid sessions (property: all valid inputs)', async () => {
    const phones = [
      '5493413646222',
      '+5493413646222',
      '1234567890',
      '+19876543210',
    ];
    const messages = ['Hola', 'Test', 'Mensaje largo con más texto'];

    for (const phone of phones) {
      for (const message of messages) {
        const { pageMock } = buildContactFoundPageMock();
        const session = buildSession(pageMock, true);

        const result = await session.sendMessage(phone, message);

        expect(result).toEqual({ success: true });
      }
    }
  }, 60000);
});
