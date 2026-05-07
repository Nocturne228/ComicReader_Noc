import { type Component, splitProps } from 'solid-js';

import classes from '../index.module.css';
import { SettingsItem, type SettingsItemProps } from './SettingsItem';

export type SettingsItemSwitchProps = {
  onClick: () => void;
} & SettingsItemProps;

/** 按钮式菜单项 */
export const SettingsItemButton: Component<SettingsItemSwitchProps> = (
  props,
) => {
  const [, others] = splitProps(props, ['children', 'onClick']);

  return (
    <SettingsItem {...others}>
      <button
        class={classes.SettingsItemIconButton}
        type="button"
        on:click={props.onClick}
        children={props.children}
      />
    </SettingsItem>
  );
};
