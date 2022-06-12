import generator, { Entity } from 'megalodon'
import { Module, MutationTree, ActionTree } from 'vuex'
import { RootState } from '@/store'
import { LoadPositionWithTag } from '@/types/loadPosition'
import { MyWindow } from '~/src/types/global'

const win = window as any as MyWindow

export type TagState = {
  timeline: Array<Entity.Status>
  lazyLoading: boolean
  heading: boolean
  scrolling: boolean
}

const state = (): TagState => ({
  timeline: [],
  lazyLoading: false,
  heading: true,
  scrolling: false
})

export const MUTATION_TYPES = {
  CHANGE_HEADING: 'changeHeading',
  APPEND_TIMELINE: 'appendTimeline',
  UPDATE_TIMELINE: 'updateTimeline',
  INSERT_TIMELINE: 'insertTimeline',
  ARCHIVE_TIMELINE: 'archiveTimeline',
  CLEAR_TIMELINE: 'clearTimeline',
  UPDATE_TOOT: 'updateToot',
  DELETE_TOOT: 'deleteToot',
  CHANGE_LAZY_LOADING: 'changeLazyLoading',
  CHANGE_SCROLLING: 'changeScrolling'
}

const mutations: MutationTree<TagState> = {
  [MUTATION_TYPES.CHANGE_HEADING]: (state, value: boolean) => {
    state.heading = value
  },
  [MUTATION_TYPES.APPEND_TIMELINE]: (state, update: Entity.Status) => {
    // Reject duplicated status in timeline
    if (!state.timeline.find(item => item.id === update.id)) {
      state.timeline = [update].concat(state.timeline)
    }
  },
  [MUTATION_TYPES.UPDATE_TIMELINE]: (state, timeline: Array<Entity.Status>) => {
    state.timeline = timeline
  },
  [MUTATION_TYPES.INSERT_TIMELINE]: (state, messages: Array<Entity.Status>) => {
    state.timeline = state.timeline.concat(messages)
  },
  [MUTATION_TYPES.ARCHIVE_TIMELINE]: state => {
    state.timeline = state.timeline.slice(0, 40)
  },
  [MUTATION_TYPES.CLEAR_TIMELINE]: state => {
    state.timeline = []
  },
  [MUTATION_TYPES.UPDATE_TOOT]: (state, message: Entity.Status) => {
    state.timeline = state.timeline.map(toot => {
      if (toot.id === message.id) {
        return message
      } else if (toot.reblog !== null && toot.reblog.id === message.id) {
        // When user reblog/favourite a reblogged toot, target message is a original toot.
        // So, a message which is received now is original toot.
        const reblog = {
          reblog: message
        }
        return Object.assign(toot, reblog)
      } else {
        return toot
      }
    })
  },
  [MUTATION_TYPES.DELETE_TOOT]: (state, id: string) => {
    state.timeline = state.timeline.filter(toot => {
      if (toot.reblog !== null && toot.reblog.id === id) {
        return false
      } else {
        return toot.id !== id
      }
    })
  },
  [MUTATION_TYPES.CHANGE_LAZY_LOADING]: (state, value: boolean) => {
    state.lazyLoading = value
  },
  [MUTATION_TYPES.CHANGE_SCROLLING]: (state, value: boolean) => {
    state.scrolling = value
  }
}

export const ACTION_TYPES = {
  FETCH: 'fetch',
  START_STREAMING: 'startStreaming',
  STOP_STREAMING: 'stopStreaming',
  LAZY_FETCH_TIMELINE: 'lazyFetchTimeline'
}

const actions: ActionTree<TagState, RootState> = {
  [ACTION_TYPES.FETCH]: async ({ commit, rootState }, tag: string): Promise<Array<Entity.Status>> => {
    const client = generator(
      rootState.TimelineSpace.sns,
      rootState.TimelineSpace.account.baseURL,
      rootState.TimelineSpace.account.accessToken,
      rootState.App.userAgent
    )
    const res = await client.getTagTimeline(encodeURIComponent(tag), { limit: 40 })
    commit(MUTATION_TYPES.UPDATE_TIMELINE, res.data)
    return res.data
  },
  [ACTION_TYPES.START_STREAMING]: ({ state, commit, rootState }, tag: string) => {
    win.ipcRenderer.on('update-start-tag-streaming', (_, update: Entity.Status) => {
      commit(MUTATION_TYPES.APPEND_TIMELINE, update)
      if (state.heading && Math.random() > 0.8) {
        commit(MUTATION_TYPES.ARCHIVE_TIMELINE)
      }
    })
    win.ipcRenderer.on('delete-start-tag-streaming', (_, id: string) => {
      commit(MUTATION_TYPES.DELETE_TOOT, id)
    })
    // @ts-ignore
    return new Promise((resolve, reject) => {
      // eslint-disable-line no-unused-vars
      win.ipcRenderer.send('start-tag-streaming', {
        tag: encodeURIComponent(tag),
        accountID: rootState.TimelineSpace.account._id
      })
      win.ipcRenderer.once('error-start-tag-streaming', (_, err: Error) => {
        reject(err)
      })
    })
  },
  [ACTION_TYPES.STOP_STREAMING]: () => {
    return new Promise(resolve => {
      win.ipcRenderer.removeAllListeners('error-start-tag-streaming')
      win.ipcRenderer.removeAllListeners('update-start-tag-streaming')
      win.ipcRenderer.removeAllListeners('delete-start-tag-streaming')
      win.ipcRenderer.send('stop-tag-streaming')
      resolve(null)
    })
  },
  [ACTION_TYPES.LAZY_FETCH_TIMELINE]: async (
    { state, commit, rootState },
    loadPosition: LoadPositionWithTag
  ): Promise<Array<Entity.Status> | null> => {
    if (state.lazyLoading) {
      return Promise.resolve(null)
    }
    commit(MUTATION_TYPES.CHANGE_LAZY_LOADING, true)
    const client = generator(
      rootState.TimelineSpace.sns,
      rootState.TimelineSpace.account.baseURL,
      rootState.TimelineSpace.account.accessToken,
      rootState.App.userAgent
    )
    return client
      .getTagTimeline(loadPosition.tag, { max_id: loadPosition.status.id, limit: 40 })
      .then(res => {
        commit(MUTATION_TYPES.INSERT_TIMELINE, res.data)
        return res.data
      })
      .finally(() => {
        commit(MUTATION_TYPES.CHANGE_LAZY_LOADING, false)
      })
  }
}

const Tag: Module<TagState, RootState> = {
  namespaced: true,
  state: state,
  mutations: mutations,
  actions: actions
}

export default Tag
