import VNode, {createEmptyVNode} from './vnode.js'
import Watcher from './watcher.js'
class Vue {
  constructor (options) {
    this.$options = options

    this.initProps()
    this.proxy = this.initDataProxy()
    this.initWatcher()
    this.initWatch()

    return this.proxy
  }
  $emit (...options) {
    const [name, ...rest] = options
    const cb = this._events[name]
    if (cb) cb(...rest)
  }
  $watch (key, cb) {
    this.dataNotifyChain[key] = this.dataNotifyChain[key] || []
    this.dataNotifyChain[key].push(cb)
  }
  $mount (root) {
    this.$el = root

    // first render
    this._duringFirstRendering = true
    this.update(true)
    this._duringFirstRendering = false

    const { mounted } = this.$options
    mounted && mounted.call(this.proxy)

    return this
  }
  update (firstRender) {
    const parent = (this.$el || {}).parentElement

    const vnode = this.$options.render.call(this.proxy, this.createElement.bind(this))

    const oldEl = this.$el

    this.$el = this.patch(null, vnode)

    if (parent) {
      parent.replaceChild(this.$el, oldEl)
    }

    console.log('updated')
  }
  /**
   * TODO: patch just create new dom tree from new vnode at the present. we'll implement patch algorithm later.
   */
  patch (oldVnode, newVnode) {
    return this.createDom(newVnode)
  }
  createElement(tag, data, children) {
    const components = this.$options.components || {}

    if (tag in components) {
      return new VNode(tag, data, children, components[tag])
    }

    return new VNode(tag, data, children)
  }
  createDom (vnode) {
    // vnode is a component
    if (vnode.componentOptions) { 
      const componentInstance = new Vue(Object.assign({}, vnode.componentOptions, { propsData: vnode.data.props }))
      vnode.componentInstance = componentInstance
      componentInstance._events = (vnode.data || {}).on || {}
      componentInstance.$mount()
      return componentInstance.$el
    }

    const el = document.createElement(vnode.tag)
    el.__vue__ = this

    const data = vnode.data || {}

    // set dom attributes
    const attributes = data.attrs || {}
    for (let key in attributes) {
      el.setAttribute(key, attributes[key]);
    }

    // set class
    const classname = data.class
    if (classname) {
      el.setAttribute('class', classname);
    }

    // set dom eventlistener
    const events = data.on || {}
    for (let key in events) {
      el.addEventListener(key, events[key])
    }

    if (!Array.isArray(vnode.children)) {
      el.textContent = vnode.children + ''
    } else {
      vnode.children.forEach(child => {
        if (typeof child === 'string') {
          el.textContent = child
        } else {
          el.appendChild(this.createDom(child))
        }
      });
    }

    return el
  }
  initDataProxy () {
    // https://stackoverflow.com/questions/37714787/can-i-extend-proxy-with-an-es2015-class

    const createDataProxyHandler = path => {
      return {
        set: (obj, key, value) => {
          const fullPath = path ? path + '.' + key : key

          const pre = obj[key]
          obj[key] = value
  
          this.notifyDataChange(fullPath, pre, value)

          return true
        },
        get: (obj, key) => {
          const fullPath = path ? path + '.' + key : key

          this.collect(fullPath)

          if (typeof obj[key] === 'object' && obj[key] !== null) {
            return new Proxy(obj[key], createDataProxyHandler(fullPath))
          } else {
            return obj[key]
          }
        },
        deleteProperty: (obj, key) => {
          if (key in obj) {
            const fullPath = path ? path + '.' + key : key
            const pre = obj[key]
            delete obj[key]
            this.notifyDataChange(fullPath, pre)
          }
          return true
        }
      }
    }

    const data = this.$data = this.$options.data ? this.$options.data() : {}
    const props = this._props
    const methods = this.$options.methods || {}
    const computed = this.$options.computed || {}

    const handler = {
      set: (_, key, value) => {
        if (key in props) { // first prop
          return createDataProxyHandler().set(props, key, value)
        } else if (key in data) { // then data
          return createDataProxyHandler().set(data, key, value)
        } else { // then class propertry and function
          this[key] = value
        }

        return true
      },
      get: (_, key) => {
        if (key in props) { // first prop
          return createDataProxyHandler().get(props, key)
        } else if (key in data) { // then data 
          return createDataProxyHandler().get(data, key)
        } else if (key in computed) { // then computed
          return computed[key].call(this.proxy)
        } else if (key in methods) { // then methods
          return methods[key].bind(this.proxy)
        } else { // then class propertry and function
          return this[key]
        }
      }
    }

    return new Proxy(this, handler)
  }
  /**
   * collect: collect dependences
   * @param {string} key The property path in data. For example, student.name students[0].name
   */
  collect (key) {
    // on first rendering
    if (this._duringFirstRendering) {
      this.$watch(key, this.update.bind(this))
    }
    // _target is set in Watcher's constructor
    if (this._target) {
      this.$watch(key, this._target.update.bind(this._target))
    }
  }
  initWatcher () {
    this.dataNotifyChain = {}
  }
  initWatch () {
    const watch = this.$options.watch || {}
    const computed = this.$options.computed || {}
    const data = this.$data

    for (let key in watch) {
      const handler = watch[key]
      if (key in data) {
        this.$watch(key, handler.bind(this.proxy))
      } else if (key in computed){
        // this will trigger the proxy getter in which we call collect with _target
        new Watcher(this.proxy, computed[key], handler)
      } else {
        throw "i don't know what you wanna do"
      }
    }
  }
  notifyDataChange (key, pre, val) {
    (this.dataNotifyChain[key] || []).forEach(cb => cb(pre, val))
  }
  initProps () {
    this._props = {}

    const { props: propsOptions, propsData } = this.$options
    if (!propsOptions || !propsOptions.length) return
  
    propsOptions.forEach(key => {
      this._props[key] = propsData[key]
    })
  }
}

export default Vue