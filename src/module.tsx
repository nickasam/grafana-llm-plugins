import { AppPlugin } from '@grafana/data';
import { App } from './components/App';
import { ConfigPage } from './components/ConfigPage';
import { HermesJsonData } from './types';

export const plugin = new AppPlugin<HermesJsonData>().setRootPage(App as any).addConfigPage({
  title: 'Settings',
  icon: 'cog',
  body: ConfigPage as any,
  id: 'settings',
});
