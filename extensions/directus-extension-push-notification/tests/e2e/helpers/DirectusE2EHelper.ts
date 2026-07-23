import { Page } from "@playwright/test";

/**
 * Helper class for Directus E2E testing with Push Notification extension
 *
 * Provides reusable methods for common Directus operations like:
 * - Authentication (login, logout)
 * - Collection operations (exists, create items, delete)
 * - Navigation (collections, settings)
 * - Push notification specific operations
 *
 * @example
 * ```typescript
 * const directus = new DirectusE2EHelper(page, baseURL);
 * await directus.login('admin@example.com', 'password');
 * await directus.navigateToCollection('user_notification');
 * await directus.createNotification({title: 'Test', body: 'Test notification'});
 * ```
 */
export class DirectusE2EHelper {
  private page: Page;
  private baseURL: string;

  constructor(page: Page, baseURL: string) {
    this.page = page;
    this.baseURL = baseURL.replace(/\/$/, ""); // Remove trailing slash
  }

  // Internal logging helpers to avoid direct console calls (ESLint no-console)
  private log(...args: unknown[]) {
    console.log("[DirectusE2E]", ...args);
  }

  private error(...args: unknown[]) {
    console.error("[DirectusE2E]", ...args);
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Login to Directus admin panel via UI
   *
   * Handles both fresh login and "Continue" button for existing sessions
   */
  async login(email: string, password: string): Promise<void> {
    this.log("Navigating to login page...");
    await this.page.goto("/admin/login", { waitUntil: "networkidle" });
    await this.page.waitForTimeout(1000);

    // Check if there's a "Continue" button (existing session)
    const continueButton = this.page.locator('button:has-text("Continue")');
    const hasContinueButton = await continueButton
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasContinueButton) {
      this.log("Found Continue button, clicking...");
      await continueButton.click();
      await this.page.waitForURL("**/admin/**", { timeout: 20000 });
    } else {
      this.log("Performing fresh login...");
      // Fresh login
      await this.page.fill('input[type="email"]', email);
      await this.page.fill('input[type="password"]', password);
      await this.page.click('button[type="submit"]');
      await this.page.waitForURL("**/admin/**", { timeout: 20000 });
    }

    await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(2000);

    this.log("Login complete");
  }

  /**
   * Logout from Directus admin panel
   */
  async logout(): Promise<void> {
    await this.page.goto("/admin/logout", { waitUntil: "networkidle" });
    await this.page.waitForTimeout(1000);
  }

  /**
   * Check if user is authenticated by verifying URL
   */
  async isAuthenticated(): Promise<boolean> {
    const url = this.page.url();
    return url.includes("/admin/") && !url.includes("/admin/login");
  }

  /**
   * Ensure user is authenticated, login if not
   */
  async ensureAuthenticated(email: string, password: string): Promise<void> {
    const authenticated = await this.isAuthenticated();

    if (!authenticated) {
      await this.login(email, password);
    }
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  /**
   * Navigate to a specific collection
   */
  async navigateToCollection(collectionName: string): Promise<void> {
    this.log(`Navigating to collection: ${collectionName}`);
    await this.page.goto(`/admin/content/${collectionName}`, {
      waitUntil: "networkidle",
    });

    // Wait for collection page to load
    await this.page.waitForSelector(
      'table, [role="table"], .v-grid, .grid-container, .v-info, .empty-state, header',
      { timeout: 20000 },
    );

    this.log(`Successfully navigated to collection: ${collectionName}`);
  }

  /**
   * Navigate to settings page
   */
  async navigateToSettings(): Promise<void> {
    this.log("Navigating to settings...");
    await this.page.goto("/admin/settings/project", {
      waitUntil: "networkidle",
    });
    await this.page.waitForTimeout(1000);
  }

  // ============================================================================
  // COLLECTION OPERATIONS
  // ============================================================================

  /**
   * Check if a collection exists by trying to navigate to it
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      await this.navigateToCollection(collectionName);

      // Check if we're still on the collection page (not redirected to 404 or error)
      const url = this.page.url();

      if (url.includes(`/admin/content/${collectionName}`)) {
        this.log(`Collection ${collectionName} exists`);
        return true;
      }

      this.log(`Collection ${collectionName} does not exist (redirected)`);
      return false;
    } catch (error) {
      this.error(
        `Error checking if collection ${collectionName} exists:`,
        error,
      );
      return false;
    }
  }

  /**
   * Create a new item in a collection via API
   */
  async createItem(
    collectionName: string,
    itemData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.log(`Creating item in collection ${collectionName}:`, itemData);

    try {
      const response = await this.page.request.post(
        `${this.baseURL}/items/${collectionName}`,
        {
          data: itemData,
        },
      );

      if (!response.ok()) {
        const errorText = await response.text();
        this.error(
          `Failed to create item: ${response.status()} - ${errorText}`,
        );
        throw new Error(`Failed to create item: ${response.status()}`);
      }

      const result = await response.json();
      this.log(`Item created successfully:`, result.data);

      return result.data;
    } catch (error) {
      this.error("Error creating item:", error);
      throw error;
    }
  }

  /**
   * Delete all items from a collection via API
   */
  async deleteAllItems(collectionName: string): Promise<void> {
    this.log(`Deleting all items from collection ${collectionName}`);

    try {
      // Get all item IDs
      const response = await this.page.request.get(
        `${this.baseURL}/items/${collectionName}?fields=id&limit=-1`,
      );

      if (!response.ok()) {
        this.error(`Failed to fetch items: ${response.status()}`);
        return;
      }

      const result = await response.json();
      const items = result.data || [];

      if (items.length === 0) {
        this.log("No items to delete");
        return;
      }

      // Delete all items
      for (const item of items) {
        await this.page.request.delete(
          `${this.baseURL}/items/${collectionName}/${item.id}`,
        );
      }

      this.log(`Deleted ${items.length} item(s) from ${collectionName}`);
    } catch (error) {
      this.error("Error deleting items:", error);
      throw error;
    }
  }

  // ============================================================================
  // PUSH NOTIFICATION SPECIFIC
  // ============================================================================

  /**
   * Create a push subscription via API
   */
  async createPushSubscription(
    subscriptionData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.log("Creating push subscription:", subscriptionData);

    try {
      const response = await this.page.request.post(
        `${this.baseURL}/items/push_subscription`,
        {
          data: subscriptionData,
        },
      );

      if (!response.ok()) {
        const errorText = await response.text();
        this.error(
          `Failed to create subscription: ${response.status()} - ${errorText}`,
        );
        throw new Error(`Failed to create subscription: ${response.status()}`);
      }

      const result = await response.json();
      this.log("Subscription created successfully:", result.data);

      return result.data;
    } catch (error) {
      this.error("Error creating push subscription:", error);
      throw error;
    }
  }

  /**
   * Create a user notification via API
   */
  async createNotification(notificationData: {
    title: string;
    body: string;
    user?: string;
    icon?: string;
    badge?: string;
    url?: string;
    data?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    this.log("Creating user notification:", notificationData);

    try {
      const response = await this.page.request.post(
        `${this.baseURL}/items/user_notification`,
        {
          data: notificationData,
        },
      );

      if (!response.ok()) {
        const errorText = await response.text();
        this.error(
          `Failed to create notification: ${response.status()} - ${errorText}`,
        );
        throw new Error(`Failed to create notification: ${response.status()}`);
      }

      const result = await response.json();
      this.log("Notification created successfully:", result.data);

      return result.data;
    } catch (error) {
      this.error("Error creating notification:", error);
      throw error;
    }
  }

  /**
   * Get push deliveries for a notification via API
   */
  async getDeliveries(
    notificationId: string,
  ): Promise<Record<string, unknown>[]> {
    this.log(`Getting deliveries for notification ${notificationId}`);

    try {
      const response = await this.page.request.get(
        `${this.baseURL}/items/push_delivery?filter[notification][_eq]=${notificationId}`,
      );

      if (!response.ok()) {
        this.error(`Failed to get deliveries: ${response.status()}`);
        return [];
      }

      const result = await response.json();
      const deliveries = result.data || [];

      this.log(`Found ${deliveries.length} deliveries`);

      return deliveries;
    } catch (error) {
      this.error("Error getting deliveries:", error);
      return [];
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Wait for a specific amount of time
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * Take a screenshot for debugging
   */
  async screenshot(name: string): Promise<void> {
    const path = `tests/e2e/screenshots/${name}.png`;
    await this.page.screenshot({ path, fullPage: true });
    this.log(`Screenshot saved: ${path}`);
  }

  /**
   * Get current page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Check if an element exists on the page
   */
  async elementExists(selector: string): Promise<boolean> {
    try {
      await this.page.waitForSelector(selector, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
