import React from 'react';
import { AppRootProps } from '@grafana/data';
import { ChatPage } from './ChatPage';
import { HermesJsonData } from '../types';

export const App: React.FC<AppRootProps<HermesJsonData>> = ({ meta }) => {
  return <ChatPage pluginId={meta.id} />;
};
