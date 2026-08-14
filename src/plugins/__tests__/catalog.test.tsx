import { makeCatalog, resolveComponent } from '@/plugins/catalog';
import { lightColors } from '@/theme/tokens';

describe('catalog', () => {
  it('resolves every spec type', () => {
    for (const t of ['Row', 'Column', 'Scroll', 'Spacer', 'Divider', 'Title', 'Subtitle', 'Text', 'TimeLabel', 'Badge', 'ProgressBar', 'Checkbox', 'Card', 'CardHeader', 'CardTitle', 'CardContent', 'Button', 'Progress', 'Separator', 'ListRow', 'SectionLabel', 'Route', 'Svg']) {
      expect(makeCatalog(lightColors)[t]).toBeDefined();
    }
  });
  it('throws on unknown type', () => {
    expect(() => resolveComponent('Nope', lightColors)).toThrow(/Unknown catalog component/);
  });
});
