describe('dark page header tabs', () => {
	const username = 'admin';
	const password = 'admin1234';

	before(() => {
		cy.resetState();
		cy.registerUser(username, password, true);
	});

	const forceUnreadableLightHeaderTheme = () => {
		cy.window().then(win => {
			win.document.documentElement.dataset.colorScheme = 'dark';
			win.document.documentElement.style.setProperty('color-scheme', 'dark', 'important');
			win.document.documentElement.style.setProperty('--MI_THEME-bg', 'rgb(12, 18, 16)', 'important');
			win.document.documentElement.style.setProperty('--MI_THEME-pageHeaderBg', 'rgb(255, 255, 255)', 'important');
			win.document.documentElement.style.setProperty('--MI_THEME-pageHeaderFg', 'rgb(20, 20, 20)', 'important');
		});
	};

	const expectDarkSurface = ($el: JQuery<HTMLElement>) => {
		const style = getComputedStyle($el[0]);
		const rgb = style.backgroundColor.match(/\d+(?:\.\d+)?/g)!.slice(0, 3).map(Number);
		const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
		expect(luminance).to.be.lessThan(0.2);
	};

	it('keeps chat home page header tabs on a dark surface', () => {
		cy.request('POST', '/api/signin-flow', { username, password }).then((res) => {
			expect(res.body.finished).to.eq(true);
			const token = res.body.i as string;
			return cy.request({
				method: 'POST',
				url: '/api/i',
				headers: { Authorization: `Bearer ${token}` },
				body: {},
			}).then((meRes) => {
				cy.visit('/chat', {
					onBeforeLoad(win) {
						win.localStorage.clear();
						win.localStorage.setItem('account', JSON.stringify({
							...meRes.body,
							token,
						}));
					},
				});
			});
		});

		// chat page header tabs (CSS-module hashed class)
		cy.get('[class*="MkPageHeader-tabs-tabs-"], [class*="tabs-tabs-"]', { timeout: 45000 }).should('be.visible');
		forceUnreadableLightHeaderTheme();
		cy.get('[class*="MkPageHeader-tabs-tabs-"], [class*="tabs-tabs-"]').first().should($tabs => {
			expectDarkSurface($tabs);
		});
	});
});
